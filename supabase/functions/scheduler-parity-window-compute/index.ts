/**
 * scheduler-parity-window-compute â€” POST endpoint.
 *
 * Given a parity_windows row, compute per-team move-up / stay /
 * move-down recommendations from current standings. Sets the
 * window's state to 'review_open' and persists the recommendations
 * for the admin's review UI to render.
 *
 * Tier ordering: divisions are ranked by `divisions.tier` text
 * compared lexicographically (PPHL conventional 'A' < 'B' < 'C' is
 * "A is the highest"). Top topFraction of a division â†’ recommend
 * move to the next tier UP (if any exists); bottom bottomFraction â†’
 * move DOWN (if any exists); rest â†’ stay.
 *
 * Permission: scheduler.run.
 *
 * Idempotent: re-running overwrites recommendations.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

interface ComputeBody {
  seasonId: string;
  windowId: string;
  topFraction?: number; // default 0.2
  bottomFraction?: number; // default 0.2
}

interface Recommendation {
  teamId: string;
  teamName: string;
  currentDivisionId: string;
  currentDivisionName: string;
  currentTier: string | null;
  recommendation: "move_up" | "stay" | "move_down";
  reasoning: string;
  targetDivisionId: string | null;
  targetDivisionName: string | null;
  points: number;
  rankInDivision: number;
  divisionSize: number;
}

interface ComputeResponse {
  windowId: string;
  state: string;
  recommendations: Recommendation[];
  summary: { moveUp: number; stay: number; moveDown: number };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: ComputeBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || !body.windowId) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "windowId"] }, 400);
  }
  const topFraction = body.topFraction ?? 0.2;
  const bottomFraction = body.bottomFraction ?? 0.2;
  if (topFraction < 0 || topFraction > 1 || bottomFraction < 0 || bottomFraction > 1) {
    return json({ error: "invalid_fractions" }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
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
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.run permission required");

  const { data: window } = await sb
    .from("parity_windows")
    .select("id, season_id, state")
    .eq("id", body.windowId)
    .maybeSingle();
  if (!window) return json({ error: "window_not_found" }, 404);
  if (window.season_id !== body.seasonId) return json({ error: "season_mismatch" }, 400);
  if (window.state === "applied" || window.state === "archived") {
    return json({ error: "window_already_finalised", state: window.state }, 409);
  }

  // Load divisions in season, sort by tier (lex ascending = "A" is highest).
  const { data: divisions } = await sb
    .from("divisions")
    .select("id, name, tier")
    .eq("season_id", body.seasonId)
    .eq("status", "active");
  const divs = (divisions ?? [])
    .map((d) => ({ id: d.id as string, name: d.name as string, tier: (d.tier as string | null) ?? "" }))
    .sort((a, b) => a.tier.localeCompare(b.tier));
  if (divs.length === 0) {
    return json({ error: "no_divisions" }, 422);
  }

  // Index next-higher and next-lower division per division (by tier order).
  const divIndex = new Map(divs.map((d, i) => [d.id, i]));
  const higherDivisionOf = (id: string) =>
    divIndex.get(id)! > 0 ? divs[divIndex.get(id)! - 1] : null;
  const lowerDivisionOf = (id: string) =>
    divIndex.get(id)! < divs.length - 1 ? divs[divIndex.get(id)! + 1] : null;
  const divisionById = new Map(divs.map((d) => [d.id, d]));

  // Load active team entries per division.
  const { data: entries } = await sb
    .from("division_team_entries")
    .select("team_id, division_id")
    .in("division_id", divs.map((d) => d.id))
    .in("entry_status", ["applied", "accepted", "confirmed"])
    .is("left_at", null);
  const entriesByDivision = new Map<string, string[]>();
  for (const e of entries ?? []) {
    const list = entriesByDivision.get(e.division_id as string) ?? [];
    list.push(e.team_id as string);
    entriesByDivision.set(e.division_id as string, list);
  }

  // Load standings for all teams in scope.
  const allTeamIds = [...new Set((entries ?? []).map((e) => e.team_id as string))];
  let standingsByTeam = new Map<string, { points: number; gd: number }>();
  if (allTeamIds.length > 0) {
    const { data: standings } = await sb
      .from("standings")
      .select("team_id, points, gd")
      .eq("league_id", season.league_id)
      .in("team_id", allTeamIds);
    standingsByTeam = new Map(
      (standings ?? []).map((s) => [
        s.team_id as string,
        { points: Number(s.points ?? 0), gd: Number(s.gd ?? 0) },
      ]),
    );
  }

  // Load team names.
  const { data: teamRows } = await sb
    .from("teams")
    .select("id, name")
    .in("id", allTeamIds.length > 0 ? allTeamIds : ["00000000-0000-0000-0000-000000000000"]);
  const teamNameById = new Map(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string]),
  );

  // Walk each division: rank teams, compute recommendation per percentile.
  const recommendations: Recommendation[] = [];
  for (const division of divs) {
    const teamIds = entriesByDivision.get(division.id) ?? [];
    if (teamIds.length === 0) continue;
    const ranked = teamIds
      .map((tid) => ({
        teamId: tid,
        points: standingsByTeam.get(tid)?.points ?? 0,
        gd: standingsByTeam.get(tid)?.gd ?? 0,
      }))
      .sort((a, b) => (b.points - a.points) || (b.gd - a.gd));
    const total = ranked.length;
    const topCount = Math.max(0, Math.floor(total * topFraction));
    const bottomCount = Math.max(0, Math.floor(total * bottomFraction));
    const higher = higherDivisionOf(division.id);
    const lower = lowerDivisionOf(division.id);
    for (let i = 0; i < ranked.length; i++) {
      const t = ranked[i]!;
      const rank = i + 1;
      let rec: Recommendation["recommendation"] = "stay";
      let reasoning = "Mid-table performance â€” keep in current division.";
      let target: { id: string; name: string } | null = null;
      if (i < topCount && higher) {
        rec = "move_up";
        target = { id: higher.id, name: higher.name };
        reasoning = `Top ${(topFraction * 100).toFixed(0)}% (${rank}/${total}) in ${division.name} â€” promote to ${higher.name}.`;
      } else if (i >= total - bottomCount && lower) {
        rec = "move_down";
        target = { id: lower.id, name: lower.name };
        reasoning = `Bottom ${(bottomFraction * 100).toFixed(0)}% (${rank}/${total}) in ${division.name} â€” relegate to ${lower.name}.`;
      } else if (i < topCount && !higher) {
        reasoning = `Top ${(topFraction * 100).toFixed(0)}% (${rank}/${total}) but already in top tier ${division.name}.`;
      } else if (i >= total - bottomCount && !lower) {
        reasoning = `Bottom ${(bottomFraction * 100).toFixed(0)}% (${rank}/${total}) but already in lowest tier ${division.name}.`;
      }
      recommendations.push({
        teamId: t.teamId,
        teamName: teamNameById.get(t.teamId) ?? t.teamId,
        currentDivisionId: division.id,
        currentDivisionName: division.name,
        currentTier: division.tier || null,
        recommendation: rec,
        reasoning,
        targetDivisionId: target?.id ?? null,
        targetDivisionName: target?.name ?? null,
        points: t.points,
        rankInDivision: rank,
        divisionSize: total,
      });
    }
  }

  // Persist recommendations + transition state.
  const { error: updErr } = await sb
    .from("parity_windows")
    .update({
      recommendations,
      state: "review_open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.windowId);
  if (updErr) return json({ error: "save_failed", detail: updErr.message }, 500);

  const summary = {
    moveUp: recommendations.filter((r) => r.recommendation === "move_up").length,
    stay: recommendations.filter((r) => r.recommendation === "stay").length,
    moveDown: recommendations.filter((r) => r.recommendation === "move_down").length,
  };

  return json<ComputeResponse>({
    windowId: body.windowId,
    state: "review_open",
    recommendations,
    summary,
  });
});
