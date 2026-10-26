/**
 * scheduler-bracket-generate - POST endpoint (FR-3.13.2).
 *
 * One-click single-elimination bracket for a division, for any number of
 * teams from 2: the bracket is the next power of two and the top seeds get
 * byes. Seeds come from the division's standings rank (points, then the
 * division's tie-break order; teams without a standings row follow by
 * name). Every real game takes a playoff-reserved ice slot of the season
 * that no live game holds, earliest rounds first. Games whose two teams
 * are known now are created as drafts (published from the bracket page);
 * the rest are created by scheduler-bracket-advance as results come in.
 * The bracket row and its games are written in one transaction
 * (sp_bracket_create, migration 0071).
 *
 * Body: { seasonId, divisionId, teamCount?, topN? (alias) }.
 * Permission: scheduler.run. A second live bracket is refused (409).
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";
import { buildBracket, bracketGames, homeAndAway, type BracketIce } from "../_shared/bracket.ts";
import { gameStartForSlot } from "../_shared/post-solve.ts";

interface GenerateBody {
  seasonId: string;
  divisionId: string;
  format?: "single_elim";
  /** How many teams go into the bracket (2 or more). Default: every team. */
  teamCount?: number;
  /** Older clients: same as teamCount. */
  topN?: number;
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

  let body: GenerateBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || !body.divisionId) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "divisionId"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
  if (!userId) return forbidden("unauthenticated");

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id, sport_code, timezone")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.run permission required");

  const { data: existing } = await sb
    .from("playoff_brackets")
    .select("id, state")
    .eq("season_id", body.seasonId)
    .eq("division_id", body.divisionId)
    .in("state", ["pending", "active"])
    .maybeSingle();
  if (existing) {
    return json({ error: "active_bracket_exists", bracketId: existing.id, message: "This division already has a bracket." }, 409);
  }

  // Teams in the division, ranked by the division's standings.
  const { data: entries } = await sb
    .from("division_team_entries")
    .select("team_id, teams!inner ( id, name )")
    .eq("division_id", body.divisionId)
    .in("entry_status", ["applied", "accepted", "confirmed"])
    .is("left_at", null);
  // deno-lint-ignore no-explicit-any
  const teams = ((entries ?? []) as any[]).map((e) => ({ id: e.team_id as string, name: (e.teams?.name as string) ?? "" }));
  const teamCount = Math.floor(Number(body.teamCount ?? body.topN ?? teams.length));
  if (!(teamCount >= 2)) {
    return json({ error: "too_few_teams", message: "A bracket needs at least 2 teams." }, 422);
  }
  if (teams.length < teamCount) {
    return json({
      error: "insufficient_teams", required: teamCount, have: teams.length,
      message: `The bracket asks for ${teamCount} teams but the division has ${teams.length}. Pick a smaller bracket or add teams.`,
    }, 422);
  }
  const { data: standings } = await sb
    .from("standings")
    .select("team_id, rank")
    .eq("division_id", body.divisionId)
    .in("team_id", teams.map((t) => t.id));
  const rankOf = new Map<string, number>((standings ?? []).map((s) => [s.team_id as string, Number(s.rank ?? 9999)] as [string, number]));
  const seeds = [...teams]
    .sort((a, b) => (rankOf.get(a.id) ?? 9999) - (rankOf.get(b.id) ?? 9999) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
    .slice(0, teamCount)
    .map((t) => t.id);

  // Playoff ice no live game holds, earliest first.
  const { data: iceRows } = await sb
    .from("ice_slots")
    .select("id, surface_id, start_ts_utc, tz, surfaces!inner ( id, label, venues!inner ( id, name ) )")
    .eq("season_id", body.seasonId)
    .eq("is_playoff_reservation", true)
    .eq("status", "available")
    .order("start_ts_utc", { ascending: true });
  // deno-lint-ignore no-explicit-any
  const allIce = (iceRows ?? []) as any[];
  const heldIds = new Set<string>();
  if (allIce.length) {
    const { data: held } = await sb
      .from("games")
      .select("slot_id")
      .in("slot_id", allIce.map((i) => i.id))
      .not("status", "in", "(cancelled,postponed)");
    for (const h of held ?? []) heldIds.add(h.slot_id as string);
  }
  const ice: BracketIce[] = allIce.filter((i) => !heldIds.has(i.id)).map((i) => ({
    id: i.id,
    startTsUtc: i.start_ts_utc,
    surfaceId: i.surface_id,
    surfaceLabel: i.surfaces.label,
    venueName: i.surfaces.venues.name,
    tz: i.tz ?? null,
  }));
  const need = bracketGames(teamCount);
  if (ice.length < need) {
    return json({
      error: "insufficient_playoff_slots", required: need, have: ice.length,
      message: `A bracket of ${teamCount} teams plays ${need} games but only ${ice.length} playoff ice slots are open. Tick Playoff ice on more slots.`,
    }, 422);
  }

  const slots = buildBracket(seeds, ice);
  const iceById = new Map(ice.map((i) => [i.id, i]));
  const games: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];
  for (const s of slots) {
    if (s.bye || !s.teamAId || !s.teamBId || !s.iceSlotId) continue;
    const i = iceById.get(s.iceSlotId)!;
    const at = gameStartForSlot(i.startTsUtc, i.tz, season.timezone as string);
    const gameId = crypto.randomUUID();
    const { homeTeamId, awayTeamId } = homeAndAway(s);
    games.push({
      id: gameId,
      league_id: season.league_id,
      season_id: body.seasonId,
      division_id: body.divisionId,
      sport_code: season.sport_code,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      scheduled_start_ts_utc: at.startTsUtc,
      tz: at.tz,
      venue_name: i.venueName,
      surface_label: i.surfaceLabel,
      slot_id: i.id,
      surface_id: i.surfaceId,
    });
    provenance.push({ game_id: gameId, constraint_ids: ["no_venue_double_book", "bracket_seeding"] });
    s.gameId = gameId;
    s.startTsUtc = at.startTsUtc;
  }

  const bracketId = crypto.randomUUID();
  const { data: created, error: rpcErr } = await sb.rpc("sp_bracket_create", {
    p_bracket: {
      id: bracketId,
      season_id: body.seasonId,
      division_id: body.divisionId,
      format: body.format ?? "single_elim",
      seed_map: seeds,
      slots,
      metadata: { topN: teamCount, teamCount, byes: slots.filter((s) => s.bye).length },
      generated_by_user_id: userId,
    },
    p_games: games,
    p_provenance: provenance,
  });
  if (rpcErr) {
    const exists = /active_bracket_exists/.test(rpcErr.message);
    console.error(`bracket-generate failed season=${body.seasonId} division=${body.divisionId}: ${rpcErr.message}`);
    return json(
      exists
        ? { error: "active_bracket_exists", message: "This division already has a bracket." }
        : { error: "bracket_write_failed", detail: rpcErr.message, message: "The bracket could not be saved. Nothing was written. Try again." },
      exists ? 409 : 500,
    );
  }
  console.log(`bracket-generate bracket=${bracketId} teams=${teamCount} games=${games.length} byes=${slots.filter((s) => s.bye).length}`);

  return json({
    bracketId,
    state: "active",
    topN: teamCount,
    teamCount,
    gamesCreated: (created as { gamesCreated?: number } | null)?.gamesCreated ?? games.length,
    slots,
  });
});
