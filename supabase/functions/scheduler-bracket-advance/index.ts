/**
 * scheduler-bracket-advance - POST endpoint (FR-3.13.3).
 *
 * Move a bracket game's winner into the next round. The server decides
 * the winner from the game's final score (completed or forfeited, not
 * tied); a `winnerTeamId` that disagrees with the score is refused. When
 * the next slot then has both teams, its game is created in that slot's
 * reserved playoff ice (rink zone, draft until published). The final marks
 * the bracket complete. The bracket update and the new game are one
 * transaction with an optimistic lock (sp_bracket_advance, migration 0071),
 * so two clicks cannot both advance.
 *
 * Body: { bracketId, gameId, winnerTeamId? }. Permission: scheduler.run.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";
import { homeAndAway, winnerFromResult, type BracketSlot } from "../_shared/bracket.ts";
import { gameStartForSlot } from "../_shared/post-solve.ts";

interface AdvanceBody {
  bracketId: string;
  gameId: string;
  winnerTeamId?: string;
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

  let body: AdvanceBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.bracketId || !body.gameId) {
    return json({ error: "missing_required_fields", fields: ["bracketId", "gameId"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
  if (!userId) return forbidden("unauthenticated");

  const { data: bracket } = await sb
    .from("playoff_brackets")
    .select("id, season_id, division_id, state, slots, updated_at")
    .eq("id", body.bracketId)
    .maybeSingle();
  if (!bracket) return json({ error: "bracket_not_found" }, 404);
  if (bracket.state !== "active") {
    return json({ error: "bracket_not_active", state: bracket.state, message: "This bracket is finished." }, 409);
  }

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id, sport_code, timezone")
    .eq("id", bracket.season_id)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: bracket.division_id as string | null,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.run permission required");

  const slots = (bracket.slots as BracketSlot[]).map((s) => ({ ...s }));
  const current = slots.find((s) => s.gameId === body.gameId);
  if (!current) return json({ error: "game_not_in_bracket" }, 404);
  if (current.winnerTeamId) {
    return json({ error: "slot_already_decided", winnerTeamId: current.winnerTeamId, message: "This game's winner already went through." }, 409);
  }

  // The final score decides who goes through.
  const { data: game } = await sb
    .from("games")
    .select("id, status, home_team_id, away_team_id, home_score, away_score")
    .eq("id", body.gameId)
    .maybeSingle();
  if (!game) return json({ error: "game_not_found" }, 404);
  const winner = winnerFromResult({
    status: game.status as string,
    homeTeamId: game.home_team_id as string,
    awayTeamId: game.away_team_id as string,
    homeScore: Number(game.home_score ?? 0),
    awayScore: Number(game.away_score ?? 0),
  });
  if (!winner) {
    return json({
      error: "game_not_decided",
      message: game.status === "completed" || game.status === "forfeited"
        ? "The final score is tied. A playoff game needs a winner: correct the score first."
        : "Finalize the game first. The winner goes through from the final score.",
    }, 409);
  }
  if (body.winnerTeamId && body.winnerTeamId !== winner) {
    return json({ error: "winner_disagrees_with_score", winnerTeamId: winner, message: "The final score says the other team won." }, 409);
  }
  current.winnerTeamId = winner;

  const games: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];
  let state = "active";
  let next: BracketSlot | undefined;
  if (current.nextSlotPosition === null || current.nextSlotSide === null) {
    state = "complete";
  } else {
    next = slots.find((s) => s.round === current.round + 1 && s.position === current.nextSlotPosition);
    if (!next) return json({ error: "next_slot_missing" }, 500);
    const seed = winner === current.teamAId ? current.seedA : current.seedB;
    if (current.nextSlotSide === "A") { next.teamAId = winner; next.seedA = seed; }
    else { next.teamBId = winner; next.seedB = seed; }
    if (next.teamAId && next.teamBId && !next.gameId && next.iceSlotId) {
      const { data: ice } = await sb
        .from("ice_slots")
        .select("id, surface_id, start_ts_utc, tz")
        .eq("id", next.iceSlotId)
        .maybeSingle();
      const at = gameStartForSlot((ice?.start_ts_utc as string) ?? next.startTsUtc!, (ice?.tz as string) ?? null, season.timezone as string);
      const gameId = crypto.randomUUID();
      const { homeTeamId, awayTeamId } = homeAndAway(next);
      games.push({
        id: gameId,
        league_id: season.league_id,
        season_id: bracket.season_id,
        division_id: bracket.division_id,
        sport_code: season.sport_code,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        scheduled_start_ts_utc: at.startTsUtc,
        tz: at.tz,
        venue_name: next.venueName,
        surface_label: next.surfaceLabel,
        slot_id: next.iceSlotId,
        surface_id: (ice?.surface_id as string) ?? null,
      });
      provenance.push({ game_id: gameId });
      next.gameId = gameId;
      next.startTsUtc = at.startTsUtc;
    }
  }

  const { error: rpcErr } = await sb.rpc("sp_bracket_advance", {
    p_bracket_id: body.bracketId,
    p_expected_updated_at: bracket.updated_at,
    p_slots: slots,
    p_state: state,
    p_games: games,
    p_provenance: provenance,
  });
  if (rpcErr) {
    const changed = /bracket_changed/.test(rpcErr.message);
    console.error(`bracket-advance failed bracket=${body.bracketId} game=${body.gameId}: ${rpcErr.message}`);
    return json(
      changed
        ? { error: "bracket_changed", message: "Someone else just updated this bracket. Reload and try again." }
        : { error: "bracket_write_failed", detail: rpcErr.message, message: "Nothing was saved. Try again." },
      changed ? 409 : 500,
    );
  }
  console.log(`bracket-advance bracket=${body.bracketId} game=${body.gameId} winner=${winner} state=${state} newGames=${games.length}`);

  return json({
    bracketId: body.bracketId,
    bracketState: state,
    winnerTeamId: winner,
    updatedSlot: { round: current.round, position: current.position },
    nextSlot: next ? { round: next.round, position: next.position, gameId: next.gameId } : null,
    nextGameCreated: games.length > 0,
  });
});
