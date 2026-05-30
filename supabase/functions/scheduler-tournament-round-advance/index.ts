/**
 * scheduler-tournament-round-advance — POST endpoint (pain #4).
 *
 * Given a tournament round whose games are complete, evaluate each
 * team's W/L within their tier and create the NEXT round:
 *   - top topFraction of each tier → move to next-higher tier (capped at upper)
 *   - bottom bottomFraction → move to next-lower tier (capped at lower)
 *   - mid stays in current tier
 * Then mirror init: generate round-robin fixtures per tier, insert
 * games rows pointing at available ice slots in the (optional) next-
 * round time window.
 *
 * Permission: scheduler.run.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

type Tier = "upper" | "middle" | "lower";
const TIER_ORDER: Tier[] = ["upper", "middle", "lower"];

function tierUp(t: Tier): Tier {
  return t === "lower" ? "middle" : t === "middle" ? "upper" : "upper";
}
function tierDown(t: Tier): Tier {
  return t === "upper" ? "middle" : t === "middle" ? "lower" : "lower";
}

interface AdvanceBody {
  seasonId: string;
  fromRoundId: string;
  newLabel?: string;
  newStartsAt?: string;
  newEndsAt?: string;
  topFraction?: number; // default 0.25 — top quarter promotes
  bottomFraction?: number; // default 0.25 — bottom quarter relegates
}

interface NewAssignment {
  teamId: string;
  teamName: string;
  fromTier: Tier;
  toTier: Tier;
  wins: number;
  losses: number;
  rankInTier: number;
  tierSize: number;
  reasoning: string;
}

interface Fixture {
  gameId: string;
  tier: Tier;
  teamAId: string;
  teamBId: string;
  slotId: string;
}

interface AdvanceResponse {
  newRoundId: string;
  newRoundIndex: number;
  state: string;
  assignments: NewAssignment[];
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

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: AdvanceBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || !body.fromRoundId) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "fromRoundId"] }, 400);
  }
  const topFraction = body.topFraction ?? 0.25;
  const bottomFraction = body.bottomFraction ?? 0.25;

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

  // Load prior round.
  const { data: priorRound } = await sb
    .from("tournament_rounds")
    .select("id, season_id, round_index, state, metadata")
    .eq("id", body.fromRoundId)
    .maybeSingle();
  if (!priorRound) return json({ error: "from_round_not_found" }, 404);
  if (priorRound.season_id !== body.seasonId) return json({ error: "season_mismatch" }, 400);

  // deno-lint-ignore no-explicit-any
  const priorMeta = (priorRound.metadata as any) ?? {};
  const divisionId = priorMeta.divisionId as string | undefined;
  if (!divisionId) return json({ error: "from_round_missing_division" }, 422);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId,
  });
  if (!allowed) return forbidden("scheduler.run permission required");

  // Read prior assignments + fixtures.
  const { data: priorAssignments } = await sb
    .from("tournament_tier_assignments")
    .select("team_id, tier")
    .eq("round_id", body.fromRoundId);
  const priorTierByTeam = new Map<string, Tier>(
    (priorAssignments ?? []).map((a) => [a.team_id as string, a.tier as Tier]),
  );

  const priorFixtures = (priorMeta.fixtures ?? []) as Fixture[];
  const fixtureGameIds = priorFixtures.map((f) => f.gameId);
  let gameStatusById = new Map<string, { status: string; home: number; away: number; homeId: string; awayId: string }>();
  if (fixtureGameIds.length > 0) {
    const { data: games } = await sb
      .from("games")
      .select("id, status, home_score, away_score, home_team_id, away_team_id")
      .in("id", fixtureGameIds);
    gameStatusById = new Map(
      (games ?? []).map((g) => [
        g.id as string,
        {
          status: g.status as string,
          home: Number(g.home_score ?? 0),
          away: Number(g.away_score ?? 0),
          homeId: g.home_team_id as string,
          awayId: g.away_team_id as string,
        },
      ]),
    );
  }

  // Tally wins per team within the prior round.
  const winsByTeam = new Map<string, number>();
  const lossesByTeam = new Map<string, number>();
  for (const team of priorTierByTeam.keys()) {
    winsByTeam.set(team, 0);
    lossesByTeam.set(team, 0);
  }
  for (const f of priorFixtures) {
    const g = gameStatusById.get(f.gameId);
    if (!g || g.status !== "completed") continue;
    if (g.home > g.away) {
      winsByTeam.set(g.homeId, (winsByTeam.get(g.homeId) ?? 0) + 1);
      lossesByTeam.set(g.awayId, (lossesByTeam.get(g.awayId) ?? 0) + 1);
    } else if (g.away > g.home) {
      winsByTeam.set(g.awayId, (winsByTeam.get(g.awayId) ?? 0) + 1);
      lossesByTeam.set(g.homeId, (lossesByTeam.get(g.homeId) ?? 0) + 1);
    }
    // ties: no W/L change
  }

  // Hydrate team names.
  const teamIds = [...priorTierByTeam.keys()];
  const { data: teamRows } = await sb.from("teams").select("id, name").in(
    "id",
    teamIds.length > 0 ? teamIds : ["00000000-0000-0000-0000-000000000000"],
  );
  const teamNameById = new Map<string, string>(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string]),
  );

  // Group teams by prior tier and rank by wins desc, losses asc, teamId asc.
  const teamsPerTier: Record<Tier, string[]> = { upper: [], middle: [], lower: [] };
  for (const [teamId, tier] of priorTierByTeam) teamsPerTier[tier].push(teamId);
  for (const tier of TIER_ORDER) {
    teamsPerTier[tier].sort((a, b) => {
      const aw = winsByTeam.get(a) ?? 0;
      const bw = winsByTeam.get(b) ?? 0;
      if (bw !== aw) return bw - aw;
      const al = lossesByTeam.get(a) ?? 0;
      const bl = lossesByTeam.get(b) ?? 0;
      if (al !== bl) return al - bl;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  // Build new assignments.
  const newAssignments: NewAssignment[] = [];
  for (const tier of TIER_ORDER) {
    const teams = teamsPerTier[tier];
    const n = teams.length;
    const topCount = Math.max(0, Math.floor(n * topFraction));
    const bottomCount = Math.max(0, Math.floor(n * bottomFraction));
    for (let i = 0; i < n; i++) {
      const teamId = teams[i]!;
      const rank = i + 1;
      let toTier: Tier = tier;
      let reasoning = `Mid-table in ${tier} (rank ${rank}/${n}) — stay.`;
      if (i < topCount) {
        toTier = tierUp(tier);
        reasoning = toTier === tier
          ? `Top ${rank}/${n} in upper tier — already top, stay.`
          : `Top ${rank}/${n} in ${tier} — promote to ${toTier}.`;
      } else if (i >= n - bottomCount) {
        toTier = tierDown(tier);
        reasoning = toTier === tier
          ? `Bottom ${rank}/${n} in lower tier — already bottom, stay.`
          : `Bottom ${rank}/${n} in ${tier} — relegate to ${toTier}.`;
      }
      newAssignments.push({
        teamId,
        teamName: teamNameById.get(teamId) ?? teamId,
        fromTier: tier,
        toTier,
        wins: winsByTeam.get(teamId) ?? 0,
        losses: lossesByTeam.get(teamId) ?? 0,
        rankInTier: rank,
        tierSize: n,
        reasoning,
      });
    }
  }

  // Insert new round.
  const newIndex = (priorRound.round_index as number) + 1;
  const { data: newRound, error: rErr } = await sb
    .from("tournament_rounds")
    .insert({
      season_id: body.seasonId,
      round_index: newIndex,
      label: body.newLabel ?? null,
      state: "pending",
      starts_at: body.newStartsAt ?? null,
      ends_at: body.newEndsAt ?? null,
      metadata: { divisionId },
    })
    .select("id")
    .single();
  if (rErr || !newRound) return json({ error: "round_insert_failed", detail: rErr?.message }, 500);
  const newRoundId = newRound.id as string;

  // Insert tier assignments.
  await sb.from("tournament_tier_assignments").insert(
    newAssignments.map((a) => ({
      round_id: newRoundId,
      team_id: a.teamId,
      tier: a.toTier,
      reasoning: a.reasoning,
    })),
  );

  // Mark prior round complete.
  await sb
    .from("tournament_rounds")
    .update({ state: "complete", updated_at: new Date().toISOString() })
    .eq("id", body.fromRoundId);

  // Build matchups for next round.
  const teamsByTierNext: Record<Tier, string[]> = { upper: [], middle: [], lower: [] };
  for (const a of newAssignments) teamsByTierNext[a.toTier].push(a.teamId);

  type Matchup = { tier: Tier; teamA: string; teamB: string };
  const matchups: Matchup[] = [];
  for (const tier of TIER_ORDER) {
    const ts = teamsByTierNext[tier];
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        matchups.push({ tier, teamA: ts[i]!, teamB: ts[j]! });
      }
    }
  }

  // Load slots for next round window.
  let slotQ = sb
    .from("ice_slots")
    .select(`id, surface_id, start_ts_utc, surfaces!inner ( id, label, venues!inner ( id, name ) )`)
    .eq("season_id", body.seasonId)
    .eq("is_playoff_reservation", false)
    .eq("status", "available")
    .order("start_ts_utc", { ascending: true });
  if (body.newStartsAt) slotQ = slotQ.gte("start_ts_utc", body.newStartsAt);
  if (body.newEndsAt) slotQ = slotQ.lte("start_ts_utc", body.newEndsAt);
  const { data: slotRows } = await slotQ;
  const slots = (slotRows ?? []) as IceSlot[];
  if (matchups.length > slots.length) {
    return json(
      { error: "insufficient_slots", needed: matchups.length, have: slots.length, newRoundId },
      422,
    );
  }

  // Greedy slot assignment (same as init).
  const fixtures: Fixture[] = [];
  const gameRows: Record<string, unknown>[] = [];
  const provRows: Record<string, unknown>[] = [];
  const usedSlotIds = new Set<string>();
  const teamSlotTs = new Map<string, Set<string>>();
  for (const m of matchups) {
    let chosenSlot: IceSlot | null = null;
    for (const slot of slots) {
      if (usedSlotIds.has(slot.id)) continue;
      if (teamSlotTs.get(m.teamA)?.has(slot.start_ts_utc)) continue;
      if (teamSlotTs.get(m.teamB)?.has(slot.start_ts_utc)) continue;
      chosenSlot = slot;
      break;
    }
    if (!chosenSlot) {
      return json({ error: "no_feasible_slot_for_matchup", matchup: m, newRoundId }, 422);
    }
    usedSlotIds.add(chosenSlot.id);
    const aSet = teamSlotTs.get(m.teamA) ?? new Set<string>();
    aSet.add(chosenSlot.start_ts_utc);
    teamSlotTs.set(m.teamA, aSet);
    const bSet = teamSlotTs.get(m.teamB) ?? new Set<string>();
    bSet.add(chosenSlot.start_ts_utc);
    teamSlotTs.set(m.teamB, bSet);
    const gameId = crypto.randomUUID();
    fixtures.push({ gameId, tier: m.tier, teamAId: m.teamA, teamBId: m.teamB, slotId: chosenSlot.id });
    gameRows.push({
      id: gameId,
      league_id: season.league_id,
      season_id: body.seasonId,
      division_id: divisionId,
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
      metadata: { tournamentRoundId: newRoundId, tier: m.tier },
    });
    provRows.push({
      game_id: gameId,
      placement_pass: "initial_assignment",
      constraint_ids: ["no_venue_double_book", "no_team_overlap"],
    });
  }
  if (gameRows.length > 0) {
    const { error: gErr } = await sb.from("games").insert(gameRows);
    if (gErr) return json({ error: "games_insert_failed", detail: gErr.message, newRoundId }, 500);
    await sb.from("game_provenance").insert(provRows);
  }

  await sb
    .from("tournament_rounds")
    .update({
      state: "active",
      metadata: { divisionId, fixtures },
      updated_at: new Date().toISOString(),
    })
    .eq("id", newRoundId);

  return json<AdvanceResponse>({
    newRoundId,
    newRoundIndex: newIndex,
    state: "active",
    assignments: newAssignments,
    fixturesCreated: fixtures.length,
    perTier: {
      upper: fixtures.filter((f) => f.tier === "upper").length,
      middle: fixtures.filter((f) => f.tier === "middle").length,
      lower: fixtures.filter((f) => f.tier === "lower").length,
    },
  });
});
