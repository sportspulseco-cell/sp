/**
 * scheduler-brackets-list â€” POST endpoint.
 *
 * Hydrated read view over playoff_brackets for a season. For each
 * bracket: per-slot team names (resolved from seed_map + teamAId /
 * teamBId), division name, current game status per slot.
 *
 * Permission: scheduler.report.read.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

interface ListBody { seasonId: string; }

interface BracketSlotView {
  round: number;
  position: number;
  startTsUtc: string;
  surfaceLabel: string;
  venueName: string;
  gameId: string | null;
  gameStatus: string | null;
  homeScore: number | null;
  awayScore: number | null;
  seedA: number | null;
  seedB: number | null;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string | null;
  teamBName: string | null;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  nextSlotPosition: number | null;
  nextSlotSide: "A" | "B" | null;
}

interface BracketView {
  id: string;
  divisionId: string | null;
  divisionName: string | null;
  format: string;
  state: string;
  topN: number;
  totalRounds: number;
  slots: BracketSlotView[];
  generatedAt: string | null;
  championTeamId: string | null;
  championTeamName: string | null;
}

interface ListResponse {
  seasonId: string;
  brackets: BracketView[];
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

  const { data: bracketRows } = await sb
    .from("playoff_brackets")
    .select("id, division_id, format, state, slots, metadata, generated_at")
    .eq("season_id", body.seasonId)
    .order("created_at", { ascending: true });

  const brackets: BracketView[] = [];
  if (!bracketRows || bracketRows.length === 0) {
    return json<ListResponse>({ seasonId: body.seasonId, brackets });
  }

  // Hydrate division names + all team names + all game statuses.
  const divIds = [...new Set(bracketRows.map((b) => b.division_id as string | null).filter((id): id is string => Boolean(id)))];
  const divNameById = new Map<string, string>();
  if (divIds.length > 0) {
    const { data: divs } = await sb.from("divisions").select("id, name").in("id", divIds);
    for (const d of divs ?? []) divNameById.set(d.id as string, d.name as string);
  }

  const allTeamIds = new Set<string>();
  const allGameIds = new Set<string>();
  for (const b of bracketRows) {
    // deno-lint-ignore no-explicit-any
    for (const s of (b.slots as any[]) ?? []) {
      if (s.teamAId) allTeamIds.add(s.teamAId);
      if (s.teamBId) allTeamIds.add(s.teamBId);
      if (s.winnerTeamId) allTeamIds.add(s.winnerTeamId);
      if (s.gameId) allGameIds.add(s.gameId);
    }
  }
  const teamNameById = new Map<string, string>();
  if (allTeamIds.size > 0) {
    const { data: teams } = await sb.from("teams").select("id, name").in("id", [...allTeamIds]);
    for (const t of teams ?? []) teamNameById.set(t.id as string, t.name as string);
  }
  const gameStatusById = new Map<string, { status: string; home: number | null; away: number | null }>();
  if (allGameIds.size > 0) {
    const { data: games } = await sb
      .from("games")
      .select("id, status, home_score, away_score")
      .in("id", [...allGameIds]);
    for (const g of games ?? []) {
      gameStatusById.set(g.id as string, {
        status: g.status as string,
        home: g.home_score as number | null,
        away: g.away_score as number | null,
      });
    }
  }

  for (const b of bracketRows) {
    // deno-lint-ignore no-explicit-any
    const slots = ((b.slots as any[]) ?? []) as Array<{
      round: number; position: number; iceSlotId: string;
      startTsUtc: string; surfaceLabel: string; venueName: string;
      gameId: string | null;
      seedA: number | null; seedB: number | null;
      teamAId: string | null; teamBId: string | null;
      winnerTeamId: string | null;
      nextSlotPosition: number | null; nextSlotSide: "A" | "B" | null;
    }>;
    const totalRounds = slots.length > 0 ? Math.max(...slots.map((s) => s.round)) : 0;
    const slotsView: BracketSlotView[] = slots.map((s) => {
      const gs = s.gameId ? gameStatusById.get(s.gameId) : undefined;
      return {
        round: s.round,
        position: s.position,
        startTsUtc: s.startTsUtc,
        surfaceLabel: s.surfaceLabel,
        venueName: s.venueName,
        gameId: s.gameId,
        gameStatus: gs?.status ?? null,
        homeScore: gs?.home ?? null,
        awayScore: gs?.away ?? null,
        seedA: s.seedA,
        seedB: s.seedB,
        teamAId: s.teamAId,
        teamBId: s.teamBId,
        teamAName: s.teamAId ? (teamNameById.get(s.teamAId) ?? null) : null,
        teamBName: s.teamBId ? (teamNameById.get(s.teamBId) ?? null) : null,
        winnerTeamId: s.winnerTeamId,
        winnerTeamName: s.winnerTeamId ? (teamNameById.get(s.winnerTeamId) ?? null) : null,
        nextSlotPosition: s.nextSlotPosition,
        nextSlotSide: s.nextSlotSide,
      };
    });
    const champion = slotsView.find((s) => s.round === totalRounds && s.winnerTeamId);
    // deno-lint-ignore no-explicit-any
    const meta = (b.metadata as any) ?? {};
    brackets.push({
      id: b.id as string,
      divisionId: (b.division_id as string | null) ?? null,
      divisionName: b.division_id ? (divNameById.get(b.division_id as string) ?? null) : null,
      format: b.format as string,
      state: b.state as string,
      topN: typeof meta.topN === "number" ? meta.topN : Math.pow(2, totalRounds),
      totalRounds,
      slots: slotsView,
      generatedAt: (b.generated_at as string | null) ?? null,
      championTeamId: champion?.winnerTeamId ?? null,
      championTeamName: champion?.winnerTeamName ?? null,
    });
  }

  return json<ListResponse>({ seasonId: body.seasonId, brackets });
});
