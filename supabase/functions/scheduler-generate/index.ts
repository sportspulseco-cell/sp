/**
 * scheduler-generate - POST endpoint.
 *
 * End-to-end pipeline:
 *   1. Validate the caller (JWT verified by the platform; scheduler.run).
 *   2. Load the season, teams, ice slots, blackout dates and every game
 *      already in the division.
 *   3. Decide what stays: only DRAFT generated regular-season games
 *      (unpublished, unlocked, scheduled) are replaced. Published,
 *      playoff, locked, hand-made and played games stay. Games that stay
 *      are pinned for the solver (one per team pair, its limit) so their
 *      fixture is not placed twice; their slots never go to a new game.
 *   4. Leave out slots on blackout dates (FR-3.8.4) and slots held by any
 *      live game of the season (any division). If fewer slots are left
 *      than games to place, answer INFEASIBLE naming how many games could
 *      not be placed, before calling the solver.
 *   5. Call the CP-SAT solver (Hugging Face Spaces; unchanged).
 *   6. After it answers: balance home and away per team and swap the
 *      second meeting of a pair (FR-3.8.2; the solver always makes the
 *      earlier-listed team home), report teams over the optional weekly
 *      limit (the solver cannot enforce one), store each game at the
 *      slot's instant in the rink's zone (season zone for a slot whose
 *      zone was never set), then replace the drafts.
 *
 * Shared rules: _shared/post-solve.ts (mirror of
 * packages/scheduler-core/src/post-solve.ts, unit-tested there).
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { callSolver, SolverError } from "../_shared/solver-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";
import {
  DEFAULT_WEIGHTS,
  type LockedFixture,
  type SlotInput,
  type SolveRequest,
  type TeamInput,
  type TimeBand,
} from "../_shared/contracts.ts";
import {
  balanceHomeAway,
  enumerateFixtures,
  gameStartForSlot,
  pairKey,
  slotBlackout,
  weeklyOverLimit,
  type FixedGame,
  type ScheduleBlackout,
} from "../_shared/post-solve.ts";

interface GenerateBody {
  seasonId: string;
  divisionId: string;
  gamesPerPair?: number;
  timeLimitSeconds?: number;
  seed?: string;
  maxLateFraction?: number;
  /** Optional: report teams with more games than this in one week. */
  maxGamesPerTeamPerWeek?: number;
}

interface ScopeGame {
  id: string;
  home_team_id: string;
  away_team_id: string;
  slot_id: string | null;
  scheduled_start_ts_utc: string;
  status: string;
  source: string;
  game_type: string;
  locked_at: string | null;
  published_at: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.seasonId || !body.divisionId) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "divisionId"] }, 400);
  }
  const gamesPerPair = Math.max(1, Math.min(4, Math.floor(Number(body.gamesPerPair ?? 1)) || 1));
  const weeklyMax = body.maxGamesPerTeamPerWeek !== undefined && body.maxGamesPerTeamPerWeek !== null
    ? Math.floor(Number(body.maxGamesPerTeamPerWeek))
    : null;
  if (weeklyMax !== null && !(weeklyMax >= 1)) {
    return json({ error: "Max games per team per week must be 1 or more." }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;

  // ===== 1. Season + permission =====
  const { data: season, error: seasonErr } = await sb
    .from("seasons")
    .select("id, org_id, league_id, sport_code, config, timezone")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (seasonErr || !season) {
    return json({ error: "season_not_found", seasonId: body.seasonId }, 404);
  }
  const seasonTz = (season.timezone as string | null) ?? "UTC";

  if (!userId) return forbidden("unauthenticated");
  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.run permission required");

  // ===== 2. Teams in the division =====
  const { data: entries, error: entriesErr } = await sb
    .from("division_team_entries")
    .select("team_id, division_id")
    .eq("division_id", body.divisionId)
    .in("entry_status", ["applied", "accepted", "confirmed"])
    .is("left_at", null);
  if (entriesErr) return json({ error: "load_teams_failed", detail: entriesErr.message }, 500);

  const teams: TeamInput[] = (entries ?? []).map((e) => ({
    teamId: e.team_id as string,
    divisionId: e.division_id as string,
  }));
  if (teams.length < 2) {
    return json({ error: "insufficient_teams", count: teams.length }, 422);
  }
  const teamIds = teams.map((t) => t.teamId);
  const teamSet = new Set(teamIds);

  // ===== 3. Season ice, blackouts, games already in the division =====
  const [slotRes, blackoutRes, scopeRes] = await Promise.all([
    sb
      .from("ice_slots")
      .select(`
        id, surface_id, start_ts_utc, duration_min, tz, band, hourly_cost_cents, is_playoff_reservation,
        surfaces!inner ( id, label, venue_id, venues!inner ( id, name ) )
      `)
      .eq("season_id", body.seasonId)
      .eq("is_playoff_reservation", false)
      .eq("status", "available"),
    sb
      .from("schedule_blackouts")
      .select("start_date, end_date, surface_id, reason")
      .eq("season_id", body.seasonId),
    sb
      .from("games")
      .select("id, home_team_id, away_team_id, slot_id, scheduled_start_ts_utc, status, source, game_type, locked_at, published_at")
      .eq("season_id", body.seasonId)
      .eq("division_id", body.divisionId),
  ]);
  if (slotRes.error) return json({ error: "load_slots_failed", detail: slotRes.error.message }, 500);
  if (blackoutRes.error) return json({ error: "load_blackouts_failed", detail: blackoutRes.error.message }, 500);
  if (scopeRes.error) return json({ error: "load_games_failed", detail: scopeRes.error.message }, 500);

  const blackouts: ScheduleBlackout[] = (blackoutRes.data ?? []).map((b) => ({
    startDate: b.start_date as string,
    endDate: b.end_date as string,
    surfaceId: (b.surface_id as string | null) ?? null,
    reason: (b.reason as string | null) ?? null,
  }));

  const scopeGames = (scopeRes.data ?? []) as ScopeGame[];
  const replaceable = (g: ScopeGame) =>
    g.source === "generated" && g.game_type === "regular" && g.status === "scheduled" &&
    !g.locked_at && !g.published_at;
  const draftIds = scopeGames.filter(replaceable).map((g) => g.id);
  const kept = scopeGames.filter((g) => !replaceable(g));
  const keptSummary = {
    published: kept.filter((g) => g.game_type === "regular" && !!g.published_at).length,
    playoff: kept.filter((g) => g.game_type === "playoff").length,
    locked: kept.filter((g) => !!g.locked_at).length,
    played: kept.filter((g) => ["in_play", "completed", "forfeited"].includes(g.status)).length,
    total: kept.length,
  };

  // Slots held by a live game anywhere in the season, other than the
  // drafts this run replaces (game_slot_uniq ignores cancelled/postponed).
  const allSlotIds = (slotRes.data ?? []).map((s) => s.id as string);
  const heldBy = new Map<string, string>();
  if (allSlotIds.length) {
    // In batches: a season has hundreds of slots, and one `in.(...)` filter
    // with all of them makes a URL too long to send (J10, 26 Oct).
    const drafts = new Set(draftIds);
    const BATCH = 150;
    for (let i = 0; i < allSlotIds.length; i += BATCH) {
      const { data: holders, error: holdErr } = await sb
        .from("games")
        .select("id, slot_id, status")
        .in("slot_id", allSlotIds.slice(i, i + BATCH))
        .not("status", "in", "(cancelled,postponed)");
      if (holdErr) {
        console.error(`[scheduler-generate] slot holders batch ${i / BATCH} of ${allSlotIds.length} slots failed: ${holdErr.message}`);
        return json({ error: "load_slot_holders_failed", detail: holdErr.message }, 500);
      }
      for (const h of holders ?? []) {
        if (!drafts.has(h.id as string)) heldBy.set(h.slot_id as string, h.id as string);
      }
    }
  }

  // Games that stay and cover a regular-season fixture of this round robin.
  const covering = kept.filter((g) =>
    g.game_type === "regular" && g.status !== "cancelled" &&
    teamSet.has(g.home_team_id) && teamSet.has(g.away_team_id)
  );
  // Pin the first one per pair whose slot is live (the solver matches a
  // pin to the pair's first fixture, so a second pin would contradict).
  const pinnedSlotIds = new Set<string>();
  const pinnedPairs = new Set<string>();
  const lockedFixtures: LockedFixture[] = [];
  const extraCover = new Map<string, number>(); // pair -> kept games not pinned
  for (const g of [...covering].sort((a, b) => a.scheduled_start_ts_utc.localeCompare(b.scheduled_start_ts_utc))) {
    const key = pairKey(g.home_team_id, g.away_team_id);
    const live = !!g.slot_id && g.status !== "postponed" && allSlotIds.includes(g.slot_id);
    if (live && !pinnedPairs.has(key)) {
      pinnedPairs.add(key);
      pinnedSlotIds.add(g.slot_id!);
      lockedFixtures.push({ homeTeamId: g.home_team_id, awayTeamId: g.away_team_id, slotId: g.slot_id! });
    } else {
      extraCover.set(key, (extraCover.get(key) ?? 0) + 1);
    }
  }

  type SlotMeta = {
    slotId: string;
    surfaceId: string;
    surfaceLabel: string;
    venueId: string;
    venueName: string;
    startTsUtc: string;
    tz: string | null;
    band: TimeBand | null;
  };
  const slotMetaById = new Map<string, SlotMeta>();
  const slots: SlotInput[] = [];
  let blackedOut = 0;
  let held = 0;
  // deno-lint-ignore no-explicit-any
  for (const s of (slotRes.data ?? []) as any[]) {
    const surface = s.surfaces;
    const venue = surface.venues;
    const pinned = pinnedSlotIds.has(s.id);
    if (!pinned && heldBy.has(s.id)) { held++; continue; }
    const where = gameStartForSlot(s.start_ts_utc, s.tz, seasonTz);
    if (!pinned && slotBlackout({ startTsUtc: where.startTsUtc, surfaceId: surface.id }, seasonTz, blackouts)) {
      blackedOut++;
      continue;
    }
    slotMetaById.set(s.id, {
      slotId: s.id,
      surfaceId: surface.id,
      surfaceLabel: surface.label,
      venueId: venue.id,
      venueName: venue.name,
      startTsUtc: s.start_ts_utc,
      tz: s.tz ?? null,
      band: s.band,
    });
    slots.push({
      slotId: s.id,
      surfaceId: surface.id,
      venueId: venue.id,
      startTsUtc: s.start_ts_utc,
      durationMin: s.duration_min,
      band: s.band,
      hourlyCostCents: s.hourly_cost_cents,
      isPlayoffReservation: s.is_playoff_reservation,
    });
  }

  // ===== 4. Build SolveRequest + input hash =====
  const seed = body.seed ?? crypto.randomUUID();
  const solveReq: SolveRequest = {
    seasonId: body.seasonId,
    divisionId: body.divisionId,
    teams,
    slots,
    lockedFixtures,
    gamesPerPair,
    bandDefinitions: [],
    weights: DEFAULT_WEIGHTS,
    maxLateFraction: body.maxLateFraction,
    timeLimitSeconds: body.timeLimitSeconds ?? 60,
    seed,
  };
  const inputHash = await sha256Hex(solveReq);

  const { data: runRow, error: runInsertErr } = await sb
    .from("schedule_runs")
    .insert({
      season_id: body.seasonId,
      division_id: body.divisionId,
      engine: "cpsat",
      seed,
      input_hash: inputHash,
      constraint_snapshot: { ...solveReq, blackouts, maxGamesPerTeamPerWeek: weeklyMax },
      status: "running",
      ran_by_user_id: userId,
    })
    .select("id")
    .single();
  if (runInsertErr || !runRow) {
    return json({ error: "schedule_run_insert_failed", detail: runInsertErr?.message }, 500);
  }
  const runId = runRow.id as string;

  // ===== 5. Enough ice? Say exactly how short we are. =====
  const fixtures = enumerateFixtures(teamIds, gamesPerPair);
  const toPlace = fixtures.length; // includes the pinned (kept) ones
  if (toPlace > slots.length) {
    const short = toPlace - slots.length;
    const left = [
      blackedOut ? `${plural(blackedOut, "slot")} on blackout dates` : null,
      held ? `${plural(held, "slot")} already used by other games` : null,
    ].filter(Boolean).join(" and ");
    const infeasibility = {
      summary: `${plural(toPlace, "game")} need ice but only ${plural(slots.length, "slot")} are open${left ? ` (${left} left out)` : ""}. ${plural(short, "game")} could not be placed. Nothing was changed.`,
      hardViolations: [{
        type: "insufficient_inventory",
        description: `${plural(short, "game")} could not be placed.`,
        gamesAffected: [],
        resolutionHint: "Add ice time, remove a blackout date, or lower games per pair.",
      }],
      softViolations: [],
      unplacedGames: short,
      placedGames: 0,
    };
    await sb.from("schedule_runs").update({ status: "failed", infeasibility_report: infeasibility }).eq("id", runId);
    return json({ runId, status: "INFEASIBLE", infeasibility, gamesCreated: 0, slotsBlackedOut: blackedOut, kept: keptSummary });
  }

  // ===== 6. Call the solver =====
  let solveResp;
  try {
    solveResp = await callSolver(env, solveReq);
  } catch (err) {
    const message = err instanceof SolverError
      ? `solver ${err.status}: ${err.body.slice(0, 500)}`
      : err instanceof Error ? err.message : String(err);
    await sb
      .from("schedule_runs")
      .update({
        status: "failed",
        infeasibility_report: {
          summary: "Solver call failed",
          hardViolations: [],
          softViolations: [],
          unplacedGames: 0,
          placedGames: 0,
          solverError: message,
        },
      })
      .eq("id", runId);
    return json({ runId, status: "FAILED", error: message }, 502);
  }

  if (solveResp.status === "INFEASIBLE" || solveResp.status === "TIMEOUT") {
    await sb
      .from("schedule_runs")
      .update({
        status: solveResp.status === "TIMEOUT" ? "partial" : "failed",
        solution: solveResp,
        objective_breakdown: solveResp.objectiveBreakdown,
        infeasibility_report: solveResp.infeasibility ?? null,
        duration_ms: solveResp.solveTimeMs,
      })
      .eq("id", runId);
    return json({
      runId,
      status: solveResp.status,
      infeasibility: solveResp.infeasibility,
      gamesCreated: 0,
      slotsBlackedOut: blackedOut,
      kept: keptSummary,
    });
  }

  // ===== 7. OPTIMAL / FEASIBLE: new games only =====
  // Pinned slots are the kept games themselves. A pair covered by more
  // kept games than were pinned drops that many new games.
  const dropLeft = new Map(extraCover);
  const placed = [];
  for (const a of [...solveResp.assignments].sort((x, y) =>
    (slotMetaById.get(x.slotId)?.startTsUtc ?? "").localeCompare(slotMetaById.get(y.slotId)?.startTsUtc ?? "")
  )) {
    const meta = slotMetaById.get(a.slotId);
    if (!meta) continue; // defensive: solver returned a slot we didn't send
    if (pinnedSlotIds.has(a.slotId)) continue;
    const key = pairKey(a.homeTeamId, a.awayTeamId);
    const drop = dropLeft.get(key) ?? 0;
    if (drop > 0) { dropLeft.set(key, drop - 1); continue; }
    const at = gameStartForSlot(meta.startTsUtc, meta.tz, seasonTz);
    placed.push({ slotId: a.slotId, startTsUtc: at.startTsUtc, teamA: a.homeTeamId, teamB: a.awayTeamId, tz: at.tz, constraintIds: a.constraintIds });
  }
  const fixed: FixedGame[] = covering.map((g) => ({
    startTsUtc: g.scheduled_start_ts_utc,
    homeTeamId: g.home_team_id,
    awayTeamId: g.away_team_id,
  }));
  const balanced = balanceHomeAway(placed, fixed);
  const tzBySlot = new Map(placed.map((p) => [p.slotId, p]));
  const weekly = weeklyMax !== null
    ? weeklyOverLimit([...balanced.games, ...fixed], seasonTz, weeklyMax)
    : [];

  // 7a. Replace the drafts (only those; see step 3).
  if (draftIds.length) {
    // In batches, like the slot holders: hundreds of ids in one URL fail.
    let delErr: { message: string } | null = null;
    for (let i = 0; i < draftIds.length && !delErr; i += 150) {
      ({ error: delErr } = await sb.from("games").delete().in("id", draftIds.slice(i, i + 150)));
    }
    if (delErr) {
      await sb.from("schedule_runs").update({
        status: "failed",
        infeasibility_report: { summary: `delete prior draft games failed: ${delErr.message}`, hardViolations: [], softViolations: [], unplacedGames: 0, placedGames: 0 },
      }).eq("id", runId);
      return json({ runId, status: "FAILED", error: delErr.message }, 500);
    }
  }

  const gameRows: Record<string, unknown>[] = [];
  const provRows: Record<string, unknown>[] = [];
  for (const g of balanced.games) {
    const meta = slotMetaById.get(g.slotId)!;
    const p = tzBySlot.get(g.slotId)!;
    const gameId = crypto.randomUUID();
    gameRows.push({
      id: gameId,
      league_id: season.league_id,
      season_id: body.seasonId,
      division_id: body.divisionId,
      sport_code: season.sport_code,
      home_team_id: g.homeTeamId,
      away_team_id: g.awayTeamId,
      scheduled_start_ts_utc: g.startTsUtc,
      tz: p.tz,
      venue_name: meta.venueName,
      surface_label: meta.surfaceLabel,
      slot_id: meta.slotId,
      surface_id: meta.surfaceId,
      schedule_run_id: runId,
      source: "generated",
      time_band: meta.band,
      game_type: "regular",
      status: "scheduled",
      // locked_at NULL: engine output is never auto-locked.
      // published_at NULL: flip via publish.
    });
    provRows.push({
      game_id: gameId,
      schedule_run_id: runId,
      placement_pass: "initial_assignment",
      constraint_ids: [...p.constraintIds, "home_away_balance"],
    });
  }

  if (gameRows.length > 0) {
    const { error: insErr } = await sb.from("games").insert(gameRows);
    if (insErr) {
      await sb.from("schedule_runs").update({
        status: "failed",
        infeasibility_report: { summary: `games insert failed: ${insErr.message}`, hardViolations: [], softViolations: [], unplacedGames: 0, placedGames: 0 },
      }).eq("id", runId);
      return json({ runId, status: "FAILED", error: insErr.message }, 500);
    }
    const { error: provErr } = await sb.from("game_provenance").insert(provRows);
    if (provErr) console.error("provenance insert failed (games kept):", provErr);
  }
  console.log(`scheduler-generate run=${runId} created=${gameRows.length} replaced=${draftIds.length} kept=${kept.length} blackedOut=${blackedOut} maxImbalance=${balanced.maxImbalance}`);

  const keptText = keptSummary.total
    ? ` Kept ${plural(keptSummary.total, "game")} already in this division (${[
        keptSummary.published ? `${keptSummary.published} published` : null,
        keptSummary.playoff ? `${keptSummary.playoff} playoff` : null,
        keptSummary.locked ? `${keptSummary.locked} locked` : null,
        keptSummary.played ? `${keptSummary.played} started or played` : null,
      ].filter(Boolean).join(", ") || "hand-made"}).`
    : "";
  const message = `${plural(gameRows.length, "draft game")} created${draftIds.length ? `, replacing ${draftIds.length} earlier drafts` : ""}.${keptText}${blackedOut ? ` ${plural(blackedOut, "slot")} on blackout dates left out.` : ""}`;

  await sb
    .from("schedule_runs")
    .update({
      status: "completed",
      solution: { ...solveResp, balancedAssignments: balanced.games, homeAway: balanced.counts, weeklyOverLimit: weekly },
      objective_breakdown: { ...solveResp.objectiveBreakdown, homeAwayImbalance: balanced.maxImbalance },
      games_created: gameRows.length,
      games_locked_preserved: kept.length,
      duration_ms: solveResp.solveTimeMs,
    })
    .eq("id", runId);

  return json({
    runId,
    status: solveResp.status,
    gamesCreated: gameRows.length,
    gamesLockedPreserved: kept.length,
    draftsReplaced: draftIds.length,
    kept: keptSummary,
    slotsBlackedOut: blackedOut,
    homeAway: balanced.counts,
    maxHomeAwayImbalance: balanced.maxImbalance,
    weeklyOverLimit: weekly,
    message,
    solveTimeMs: solveResp.solveTimeMs,
  });
});
