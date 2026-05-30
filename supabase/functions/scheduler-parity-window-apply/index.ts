/**
 * scheduler-parity-window-apply — POST endpoint.
 *
 * Applies admin-confirmed parity decisions:
 *   1. For each move: withdraw the team's current
 *      division_team_entries row, insert a new one in the target
 *      division (entry_status='accepted').
 *   2. Identify affected divisions (source + target for every move).
 *   3. Delete future *unlocked* *unplayed* games for affected
 *      divisions (status='scheduled', source='generated',
 *      scheduled_start_ts_utc >= now(), locked_at IS NULL). Locked
 *      and completed games are preserved by these filters.
 *   4. Fire scheduler-generate per affected division so the engine
 *      re-fills the remaining schedule against the new rosters.
 *   5. Mark the window state='applied'.
 *
 * Permission: scheduler.run.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv, type SchedulerEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

interface Decision {
  teamId: string;
  targetDivisionId: string;
}

interface ApplyBody {
  seasonId: string;
  windowId: string;
  decisions: Decision[];
}

interface ApplyResponse {
  windowId: string;
  state: string;
  movesApplied: number;
  divisionsRegenerated: string[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function triggerRegen(
  env: SchedulerEnv,
  authHeader: string,
  seasonId: string,
  divisionId: string,
): Promise<void> {
  try {
    await fetch(`${env.supabaseUrl}/functions/v1/scheduler-generate`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId, divisionId }),
    });
  } catch (err) {
    console.error(`scheduler-generate kick failed for division ${divisionId}:`, err);
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: ApplyBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || !body.windowId || !Array.isArray(body.decisions)) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "windowId", "decisions"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return forbidden("unauthenticated");

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
  });
  if (!allowed) return forbidden("scheduler.run permission required");

  const { data: window } = await sb
    .from("parity_windows")
    .select("id, season_id, state")
    .eq("id", body.windowId)
    .maybeSingle();
  if (!window) return json({ error: "window_not_found" }, 404);
  if (window.season_id !== body.seasonId) return json({ error: "season_mismatch" }, 400);
  if (window.state === "applied" || window.state === "archived") {
    return json({ error: "window_already_applied" }, 409);
  }

  if (body.decisions.length === 0) {
    await sb.from("parity_windows").update({
      state: "skipped",
      updated_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
      applied_by_user_id: userId,
    }).eq("id", body.windowId);
    return json<ApplyResponse>({
      windowId: body.windowId,
      state: "skipped",
      movesApplied: 0,
      divisionsRegenerated: [],
    });
  }

  // Pre-load current entries for the teams being moved.
  const teamIds = [...new Set(body.decisions.map((d) => d.teamId))];
  const targetDivisionIds = [...new Set(body.decisions.map((d) => d.targetDivisionId))];
  const { data: currentEntries } = await sb
    .from("division_team_entries")
    .select("id, team_id, division_id")
    .in("team_id", teamIds)
    .in("entry_status", ["applied", "accepted", "confirmed"])
    .is("left_at", null);
  const currentByTeam = new Map(
    (currentEntries ?? []).map((e) => [
      e.team_id as string,
      { id: e.id as string, divisionId: e.division_id as string },
    ]),
  );

  // Verify target divisions belong to the same season.
  const { data: targetDivs } = await sb
    .from("divisions")
    .select("id, season_id")
    .in("id", targetDivisionIds);
  const targetSeasonByDivision = new Map(
    (targetDivs ?? []).map((d) => [d.id as string, d.season_id as string]),
  );
  for (const d of body.decisions) {
    const targetSeason = targetSeasonByDivision.get(d.targetDivisionId);
    if (targetSeason !== body.seasonId) {
      return json({ error: "target_division_outside_season", targetDivisionId: d.targetDivisionId }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const affectedDivisions = new Set<string>();
  let movesApplied = 0;

  // Apply each move: withdraw old entry + insert new entry.
  for (const decision of body.decisions) {
    const current = currentByTeam.get(decision.teamId);
    if (!current) continue;
    if (current.divisionId === decision.targetDivisionId) continue;

    // Withdraw old entry.
    const { error: withdrawErr } = await sb
      .from("division_team_entries")
      .update({ entry_status: "withdrawn", left_at: nowIso })
      .eq("id", current.id);
    if (withdrawErr) {
      console.error(`withdraw failed for entry ${current.id}:`, withdrawErr);
      continue;
    }
    // Insert new entry. Filter on partial-unique index `dte_team_division_active_uniq`
    // already excludes withdrawn rows so we don't collide.
    const { error: insErr } = await sb
      .from("division_team_entries")
      .insert({
        team_id: decision.teamId,
        division_id: decision.targetDivisionId,
        entry_status: "accepted",
        joined_at: nowIso,
      });
    if (insErr) {
      console.error(`new entry insert failed for team ${decision.teamId}:`, insErr);
      // Roll back the withdraw to avoid leaving the team in limbo.
      await sb
        .from("division_team_entries")
        .update({ entry_status: "accepted", left_at: null })
        .eq("id", current.id);
      continue;
    }
    affectedDivisions.add(current.divisionId);
    affectedDivisions.add(decision.targetDivisionId);
    movesApplied++;
  }

  // Delete future unlocked unplayed games for affected divisions.
  if (affectedDivisions.size > 0) {
    const { error: delErr } = await sb
      .from("games")
      .delete()
      .eq("season_id", body.seasonId)
      .in("division_id", [...affectedDivisions])
      .eq("source", "generated")
      .eq("status", "scheduled")
      .is("locked_at", null)
      .gte("scheduled_start_ts_utc", nowIso);
    if (delErr) {
      console.error("partial-regen delete failed:", delErr);
    }
  }

  // Persist window state.
  await sb
    .from("parity_windows")
    .update({
      state: "applied",
      applied_at: nowIso,
      applied_by_user_id: userId,
      decisions: body.decisions.map((d) => ({
        teamId: d.teamId,
        targetDivisionId: d.targetDivisionId,
        decidedAt: nowIso,
        decidedByUserId: userId,
      })),
      updated_at: nowIso,
    })
    .eq("id", body.windowId);

  // Fire-and-forget scheduler-generate per affected division.
  for (const divisionId of affectedDivisions) {
    void triggerRegen(env, authHeader, body.seasonId, divisionId);
  }

  return json<ApplyResponse>({
    windowId: body.windowId,
    state: "applied",
    movesApplied,
    divisionsRegenerated: [...affectedDivisions],
  });
});
