/**
 * scheduler-tournament-round-init — POST endpoint (pain #4).
 *
 * Creates a new tournament round with initial tier assignments
 * (typically called for Round 1). Also generates the round-robin
 * fixtures per tier and inserts them as `games` rows pointing at
 * available ice slots in the round's time window.
 *
 * Permission: scheduler.run.
 *
 * Body:
 *   {
 *     seasonId, divisionId,
 *     roundIndex,            // 1 for first round
 *     label?,
 *     startsAt?, endsAt?,    // time window for slot filtering
 *     assignments: [{teamId, tier}]
 *   }
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

type Tier = "upper" | "middle" | "lower";
const TIER_ORDER: Tier[] = ["upper", "middle", "lower"];

interface InitBody {
  seasonId: string;
  divisionId: string;
  roundIndex: number;
  label?: string;
  startsAt?: string;
  endsAt?: string;
  assignments: Array<{ teamId: string; tier: Tier }>;
}

interface InitResponse {
  roundId: string;
  roundIndex: number;
  state: string;
  fixturesCreated: number;
  perTier: Record<Tier, number>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface IceSlot {
  id: string;
  surface_id: string;
  start_ts_utc: string;
  // deno-lint-ignore no-explicit-any
  surfaces: any;
}

interface Fixture {
  gameId: string;
  tier: Tier;
  teamAId: string;
  teamBId: string;
  slotId: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: InitBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || !body.divisionId || typeof body.roundIndex !== "number" || !Array.isArray(body.assignments)) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "divisionId", "roundIndex", "assignments"] }, 400);
  }
  for (const a of body.assignments) {
    if (!a.teamId || !TIER_ORDER.includes(a.tier)) {
      return json({ error: "invalid_assignment", assignment: a }, 400);
    }
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
    .select("id, org_id, league_id, sport_code")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  });
  if (!allowed) return forbidden("scheduler.run permission required");

  // Insert round row.
  const { data: roundRow, error: roundErr } = await sb
    .from("tournament_rounds")
    .insert({
      season_id: body.seasonId,
      round_index: body.roundIndex,
      label: body.label ?? null,
      state: "pending",
      starts_at: body.startsAt ?? null,
      ends_at: body.endsAt ?? null,
      metadata: { divisionId: body.divisionId },
    })
    .select("id")
    .single();
  if (roundErr || !roundRow) {
    return json({ error: "round_insert_failed", detail: roundErr?.message }, 500);
  }
  const roundId = roundRow.id as string;

  // Insert tier assignments.
  const assignRows = body.assignments.map((a) => ({
    round_id: roundId,
    team_id: a.teamId,
    tier: a.tier,
    reasoning: "Initial tier assignment",
  }));
  const { error: assErr } = await sb
    .from("tournament_tier_assignments")
    .insert(assignRows);
  if (assErr) return json({ error: "assignments_insert_failed", detail: assErr.message }, 500);

  // Load available ice slots in window (or for the whole season if no
  // window specified). Excludes playoff-reservation and non-available
  // slots.
  let slotQ = sb
    .from("ice_slots")
    .select(`id, surface_id, start_ts_utc, surfaces!inner ( id, label, venues!inner ( id, name ) )`)
    .eq("season_id", body.seasonId)
    .eq("is_playoff_reservation", false)
    .eq("status", "available")
    .order("start_ts_utc", { ascending: true });
  if (body.startsAt) slotQ = slotQ.gte("start_ts_utc", body.startsAt);
  if (body.endsAt) slotQ = slotQ.lte("start_ts_utc", body.endsAt);
  const { data: slotRows } = await slotQ;
  const slots = (slotRows ?? []) as IceSlot[];

  // Build per-tier teamId lists.
  const teamsByTier: Record<Tier, string[]> = { upper: [], middle: [], lower: [] };
  for (const a of body.assignments) teamsByTier[a.tier].push(a.teamId);

  // Build matchups (round-robin within tier).
  type Matchup = { tier: Tier; teamA: string; teamB: string };
  const matchups: Matchup[] = [];
  for (const tier of TIER_ORDER) {
    const ts = teamsByTier[tier];
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        matchups.push({ tier, teamA: ts[i]!, teamB: ts[j]! });
      }
    }
  }
  if (matchups.length > slots.length) {
    return json(
      { error: "insufficient_slots", needed: matchups.length, have: slots.length },
      422,
    );
  }

  // Greedy slot assignment: walk matchups in order, place each in the
  // next available slot, BUT skip slots whose start time would create a
  // team conflict (two games at the same start_ts for the same team).
  const fixtures: Fixture[] = [];
  const gameRows: Record<string, unknown>[] = [];
  const provRows: Record<string, unknown>[] = [];
  const usedSlotIds = new Set<string>();
  const teamSlotTs = new Map<string, Set<string>>(); // teamId → set of start_ts already booked
  for (const m of matchups) {
    let chosenSlot: IceSlot | null = null;
    for (const slot of slots) {
      if (usedSlotIds.has(slot.id)) continue;
      const aTimes = teamSlotTs.get(m.teamA);
      const bTimes = teamSlotTs.get(m.teamB);
      if (aTimes?.has(slot.start_ts_utc) || bTimes?.has(slot.start_ts_utc)) continue;
      chosenSlot = slot;
      break;
    }
    if (!chosenSlot) {
      return json(
        { error: "no_feasible_slot_for_matchup", matchup: m },
        422,
      );
    }
    usedSlotIds.add(chosenSlot.id);
    const aSet = teamSlotTs.get(m.teamA) ?? new Set<string>();
    aSet.add(chosenSlot.start_ts_utc);
    teamSlotTs.set(m.teamA, aSet);
    const bSet = teamSlotTs.get(m.teamB) ?? new Set<string>();
    bSet.add(chosenSlot.start_ts_utc);
    teamSlotTs.set(m.teamB, bSet);
    const gameId = crypto.randomUUID();
    fixtures.push({
      gameId,
      tier: m.tier,
      teamAId: m.teamA,
      teamBId: m.teamB,
      slotId: chosenSlot.id,
    });
    gameRows.push({
      id: gameId,
      league_id: season.league_id,
      season_id: body.seasonId,
      division_id: body.divisionId,
      sport_code: season.sport_code,
      home_team_id: m.teamA,
      away_team_id: m.teamB,
      scheduled_start_ts_utc: chosenSlot.start_ts_utc,
      venue_name: chosenSlot.surfaces.venues.name,
      surface_label: chosenSlot.surfaces.label,
      slot_id: chosenSlot.id,
      surface_id: chosenSlot.surface_id,
      source: "generated",
      game_type: "regular",
      status: "scheduled",
      metadata: { tournamentRoundId: roundId, tier: m.tier },
    });
    provRows.push({
      game_id: gameId,
      placement_pass: "initial_assignment",
      constraint_ids: ["no_venue_double_book", "no_team_overlap"],
    });
  }
  if (gameRows.length > 0) {
    const { error: gErr } = await sb.from("games").insert(gameRows);
    if (gErr) return json({ error: "games_insert_failed", detail: gErr.message }, 500);
    await sb.from("game_provenance").insert(provRows);
  }

  // Persist fixtures pointer + transition round → active.
  await sb
    .from("tournament_rounds")
    .update({
      state: "active",
      metadata: { divisionId: body.divisionId, fixtures },
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  return json<InitResponse>({
    roundId,
    roundIndex: body.roundIndex,
    state: "active",
    fixturesCreated: fixtures.length,
    perTier: {
      upper: fixtures.filter((f) => f.tier === "upper").length,
      middle: fixtures.filter((f) => f.tier === "middle").length,
      lower: fixtures.filter((f) => f.tier === "lower").length,
    },
  });
});
