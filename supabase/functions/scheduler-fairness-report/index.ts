/**
 * scheduler-fairness-report — POST endpoint.
 *
 * Pain #8 — per-team time-slot fairness as a first-class deliverable.
 *
 * Loads games for a scope (season, optionally division), aggregates
 * games per team per band (early/mid/late), runs the canonical
 * `computeFairness` from scheduler-core (mirrored in _shared/fairness),
 * and returns the FairnessReport.
 *
 * Pure read endpoint. No mutations.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";
import {
  computeFairness,
  TIME_BANDS,
  type BandCounts,
  type TimeBand,
} from "../_shared/fairness.ts";

interface ReportBody {
  seasonId: string;
  divisionId?: string;
  /** Max allowed proportion-deviation from the league average; default 0.10 = 10%. */
  tolerance?: number;
  /** Hard cap on any team's late fraction (e.g. 0.30 = "≤30% after 9pm"). */
  maxLateFraction?: number;
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

  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.seasonId) {
    return json({ error: "missing_required_fields", fields: ["seasonId"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return forbidden("unauthenticated");

  const { data: season, error: seasonErr } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (seasonErr || !season) {
    return json({ error: "season_not_found", seasonId: body.seasonId }, 404);
  }

  const allowed = await userHasPermission(sb, userId, "scheduler.report.read", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  });
  if (!allowed) return forbidden("scheduler.report.read permission required");

  // Load games carrying a time_band — anything else is unscheduled or legacy.
  let q = sb
    .from("games")
    .select("home_team_id, away_team_id, time_band")
    .eq("season_id", body.seasonId)
    .not("time_band", "is", null);
  if (body.divisionId) q = q.eq("division_id", body.divisionId);
  const { data: games, error: gamesErr } = await q;
  if (gamesErr) return json({ error: "load_games_failed", detail: gamesErr.message }, 500);

  // Aggregate band counts per team.
  const perTeamCounts: Record<string, Partial<BandCounts>> = {};
  for (const g of games ?? []) {
    const band = g.time_band as TimeBand | null;
    if (!band || !(TIME_BANDS as readonly string[]).includes(band)) continue;
    for (const tid of [g.home_team_id, g.away_team_id] as string[]) {
      perTeamCounts[tid] ??= { early: 0, mid: 0, late: 0 };
      perTeamCounts[tid]![band] = (perTeamCounts[tid]![band] ?? 0) + 1;
    }
  }

  const report = computeFairness(
    perTeamCounts,
    body.tolerance ?? 0.10,
    body.maxLateFraction,
  );

  return json({
    seasonId: body.seasonId,
    divisionId: body.divisionId ?? null,
    tolerance: body.tolerance ?? 0.10,
    maxLateFraction: body.maxLateFraction ?? null,
    teamCount: report.teams.length,
    gameCount: games?.length ?? 0,
    report,
  });
});
