/**
 * scheduler-bracket-advance — POST endpoint (pain #3 part 2).
 *
 * Given a finished bracket game + the winner, advance the winner into
 * the next round's slot. If the next slot now has both teams set,
 * create the corresponding `games` row using the next slot's
 * pre-reserved ice slot. If this was the final, mark the bracket
 * state='complete'.
 *
 * Permission: scheduler.run.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

interface AdvanceBody {
  bracketId: string;
  gameId: string;
  winnerTeamId: string;
}

interface BracketSlot {
  round: number;
  position: number;
  iceSlotId: string;
  startTsUtc: string;
  surfaceLabel: string;
  venueName: string;
  gameId: string | null;
  seedA: number | null;
  seedB: number | null;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  nextSlotPosition: number | null;
  nextSlotSide: "A" | "B" | null;
}

interface AdvanceResponse {
  bracketId: string;
  bracketState: string;
  updatedSlot: { round: number; position: number };
  nextSlot: { round: number; position: number; gameId: string | null } | null;
  nextGameCreated: boolean;
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
  if (!body.bracketId || !body.gameId || !body.winnerTeamId) {
    return json({ error: "missing_required_fields", fields: ["bracketId", "gameId", "winnerTeamId"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return forbidden("unauthenticated");

  const { data: bracket } = await sb
    .from("playoff_brackets")
    .select("id, season_id, division_id, state, slots, seed_map")
    .eq("id", body.bracketId)
    .maybeSingle();
  if (!bracket) return json({ error: "bracket_not_found" }, 404);
  if (bracket.state !== "active") {
    return json({ error: "bracket_not_active", state: bracket.state }, 409);
  }

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id, sport_code")
    .eq("id", bracket.season_id)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: bracket.division_id as string | null,
  });
  if (!allowed) return forbidden("scheduler.run permission required");

  // deno-lint-ignore no-explicit-any
  const slots = (bracket.slots as BracketSlot[]).map((s) => ({ ...s }));
  const currentIdx = slots.findIndex((s) => s.gameId === body.gameId);
  if (currentIdx === -1) return json({ error: "game_not_in_bracket" }, 404);
  const current = slots[currentIdx]!;

  if (current.winnerTeamId) {
    return json({ error: "slot_already_decided", winnerTeamId: current.winnerTeamId }, 409);
  }
  if (body.winnerTeamId !== current.teamAId && body.winnerTeamId !== current.teamBId) {
    return json({ error: "winner_not_in_slot" }, 400);
  }

  current.winnerTeamId = body.winnerTeamId;

  let nextGameCreated = false;
  let nextSlotView: AdvanceResponse["nextSlot"] = null;

  if (current.nextSlotPosition === null || current.nextSlotSide === null) {
    // This was the final.
    await sb
      .from("playoff_brackets")
      .update({ slots, state: "complete", updated_at: new Date().toISOString() })
      .eq("id", body.bracketId);
    return json<AdvanceResponse>({
      bracketId: body.bracketId,
      bracketState: "complete",
      updatedSlot: { round: current.round, position: current.position },
      nextSlot: null,
      nextGameCreated: false,
    });
  }

  // Find the next slot.
  const nextRound = current.round + 1;
  const nextIdx = slots.findIndex(
    (s) => s.round === nextRound && s.position === current.nextSlotPosition,
  );
  if (nextIdx === -1) return json({ error: "next_slot_missing" }, 500);
  const next = slots[nextIdx]!;
  if (current.nextSlotSide === "A") next.teamAId = body.winnerTeamId;
  else next.teamBId = body.winnerTeamId;

  // If both teams are set on the next slot and we haven't created a
  // game for it yet, create one in its pre-reserved ice slot.
  if (next.teamAId && next.teamBId && !next.gameId) {
    const { data: iceSurface } = await sb
      .from("ice_slots")
      .select("surface_id")
      .eq("id", next.iceSlotId)
      .maybeSingle();
    const surfaceId = iceSurface?.surface_id as string | undefined;
    const gameId = crypto.randomUUID();
    const { error: gErr } = await sb.from("games").insert({
      id: gameId,
      league_id: season.league_id,
      season_id: bracket.season_id,
      division_id: bracket.division_id,
      sport_code: season.sport_code,
      home_team_id: next.teamAId,
      away_team_id: next.teamBId,
      scheduled_start_ts_utc: next.startTsUtc,
      venue_name: next.venueName,
      surface_label: next.surfaceLabel,
      slot_id: next.iceSlotId,
      surface_id: surfaceId ?? null,
      source: "generated",
      game_type: "playoff",
      status: "scheduled",
    });
    if (gErr) {
      return json({ error: "next_game_insert_failed", detail: gErr.message }, 500);
    }
    next.gameId = gameId;
    nextGameCreated = true;
    await sb.from("game_provenance").insert({
      game_id: gameId,
      placement_pass: "bracket",
      constraint_ids: ["no_venue_double_book"],
    });
  }
  nextSlotView = { round: next.round, position: next.position, gameId: next.gameId };

  await sb
    .from("playoff_brackets")
    .update({ slots, updated_at: new Date().toISOString() })
    .eq("id", body.bracketId);

  return json<AdvanceResponse>({
    bracketId: body.bracketId,
    bracketState: "active",
    updatedSlot: { round: current.round, position: current.position },
    nextSlot: nextSlotView,
    nextGameCreated,
  });
});
