/**
 * scheduler-tournament-rounds-list â€” POST endpoint (pain #4 read view).
 *
 * Returns every tournament round for a season with hydrated tier
 * assignments (team names + reasoning) and per-tier game counts.
 *
 * Permission: scheduler.report.read.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

interface ListBody { seasonId: string; }

interface TierAssignment {
  teamId: string;
  teamName: string;
  tier: "upper" | "middle" | "lower";
  reasoning: string | null;
}

interface RoundView {
  id: string;
  seasonId: string;
  roundIndex: number;
  label: string | null;
  state: string;
  startsAt: string | null;
  endsAt: string | null;
  assignments: TierAssignment[];
  fixtureCount: number;
  completedCount: number;
  createdAt: string;
}

interface ListResponse {
  seasonId: string;
  count: number;
  rounds: RoundView[];
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

  let body: ListBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId) {
    return json({ error: "missing_required_fields", fields: ["seasonId"] }, 400);
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

  const allowed = await userHasPermission(sb, userId, "scheduler.report.read", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.report.read permission required");

  const { data: rounds, error } = await sb
    .from("tournament_rounds")
    .select("id, season_id, round_index, label, state, starts_at, ends_at, metadata, created_at")
    .eq("season_id", body.seasonId)
    .order("round_index", { ascending: true });
  if (error) return json({ error: "load_rounds_failed", detail: error.message }, 500);

  if (!rounds || rounds.length === 0) {
    return json<ListResponse>({ seasonId: body.seasonId, count: 0, rounds: [] });
  }

  const roundIds = rounds.map((r) => r.id as string);
  const { data: assignments } = await sb
    .from("tournament_tier_assignments")
    .select("round_id, team_id, tier, reasoning")
    .in("round_id", roundIds);

  // Hydrate team names.
  const teamIds = [...new Set((assignments ?? []).map((a) => a.team_id as string))];
  const teamNameById = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await sb.from("teams").select("id, name").in("id", teamIds);
    for (const t of teams ?? []) teamNameById.set(t.id as string, t.name as string);
  }

  // Per-round fixture / completed counts: load games whose ids appear in
  // tournament_rounds.metadata.fixtures[].gameId.
  const allFixtureGameIds = new Set<string>();
  for (const r of rounds) {
    // deno-lint-ignore no-explicit-any
    const fixtures = ((r.metadata as any)?.fixtures ?? []) as Array<{ gameId: string }>;
    for (const f of fixtures) if (f.gameId) allFixtureGameIds.add(f.gameId);
  }
  const gameStatusById = new Map<string, string>();
  if (allFixtureGameIds.size > 0) {
    const { data: games } = await sb
      .from("games")
      .select("id, status")
      .in("id", [...allFixtureGameIds]);
    for (const g of games ?? []) gameStatusById.set(g.id as string, g.status as string);
  }

  const assignmentsByRound = new Map<string, TierAssignment[]>();
  for (const a of assignments ?? []) {
    const list = assignmentsByRound.get(a.round_id as string) ?? [];
    list.push({
      teamId: a.team_id as string,
      teamName: teamNameById.get(a.team_id as string) ?? (a.team_id as string),
      tier: a.tier as "upper" | "middle" | "lower",
      reasoning: (a.reasoning as string | null) ?? null,
    });
    assignmentsByRound.set(a.round_id as string, list);
  }

  const roundViews: RoundView[] = rounds.map((r) => {
    // deno-lint-ignore no-explicit-any
    const fixtures = ((r.metadata as any)?.fixtures ?? []) as Array<{ gameId: string }>;
    const completed = fixtures.filter(
      (f) => gameStatusById.get(f.gameId) === "completed",
    ).length;
    return {
      id: r.id as string,
      seasonId: r.season_id as string,
      roundIndex: Number(r.round_index),
      label: (r.label as string | null) ?? null,
      state: r.state as string,
      startsAt: (r.starts_at as string | null) ?? null,
      endsAt: (r.ends_at as string | null) ?? null,
      assignments: assignmentsByRound.get(r.id as string) ?? [],
      fixtureCount: fixtures.length,
      completedCount: completed,
      createdAt: r.created_at as string,
    };
  });

  return json<ListResponse>({
    seasonId: body.seasonId,
    count: roundViews.length,
    rounds: roundViews,
  });
});
