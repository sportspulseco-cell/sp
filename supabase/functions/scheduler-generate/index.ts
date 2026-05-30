/**
 * scheduler-generate — POST endpoint.
 *
 * End-to-end pipeline:
 *   1. Validate the caller (JWT verified by the platform).
 *   2. Load the season + teams + ice slots + locked fixtures.
 *   3. Build the SolveRequest, hash inputs (determinism contract).
 *   4. Insert schedule_runs row (status='running').
 *   5. POST to the HF Spaces CP-SAT solver.
 *   6. On success — delete prior generated-and-not-locked games for
 *      this scope (preserving locked fixtures and manual rows), then
 *      batch-insert new games + game_provenance, then close out the
 *      schedule_runs row with the full solution.
 *   7. On infeasibility / timeout — write the infeasibility report to
 *      the schedule_runs row and return it to the caller.
 *
 * Pains covered: #7 (locked fixtures preserved by SQL filter),
 * #5/#8/#9 (infeasibility report carries the diagnostic up).
 *
 * Pains DEFERRED to scheduler-conflict-resolve + Z3 wiring:
 *   - Per-team fairness narrative (#8)
 *   - Inline conflict options (#9)
 *   - Tiebreaker proof (#5)
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { callSolver, SolverError } from "../_shared/solver-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";
import {
  DEFAULT_WEIGHTS,
  type LockedFixture,
  type SlotInput,
  type SolveRequest,
  type TeamInput,
  type TimeBand,
} from "../_shared/contracts.ts";

interface GenerateBody {
  seasonId: string;
  divisionId: string;
  gamesPerPair?: number;
  timeLimitSeconds?: number;
  seed?: string;
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

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  // Resolve the caller's user id from the JWT — for schedule_runs.ran_by_user_id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;

  // ===== 1. Load season (for league_id / sport_code / org_id) =====
  const { data: season, error: seasonErr } = await sb
    .from("seasons")
    .select("id, org_id, league_id, sport_code, config, timezone")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (seasonErr || !season) {
    return json({ error: "season_not_found", seasonId: body.seasonId }, 404);
  }

  // ===== Permission gate (scheduler.run) =====
  if (!userId) return forbidden("unauthenticated");
  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  });
  if (!allowed) return forbidden("scheduler.run permission required");

  // ===== 2. Load teams in the division =====
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

  // ===== 3. Load ice slots for the season =====
  const { data: slotRows, error: slotsErr } = await sb
    .from("ice_slots")
    .select(`
      id,
      surface_id,
      start_ts_utc,
      duration_min,
      band,
      hourly_cost_cents,
      is_playoff_reservation,
      surfaces!inner (
        id,
        label,
        venue_id,
        venues!inner ( id, name )
      )
    `)
    .eq("season_id", body.seasonId)
    .eq("is_playoff_reservation", false)
    .eq("status", "available");
  if (slotsErr) return json({ error: "load_slots_failed", detail: slotsErr.message }, 500);

  // Index slot metadata for the games insert phase (we need surface label
  // + venue name to denormalise onto each game).
  type SlotMeta = {
    slotId: string;
    surfaceId: string;
    surfaceLabel: string;
    venueId: string;
    venueName: string;
    startTsUtc: string;
    band: TimeBand | null;
  };
  const slotMetaById = new Map<string, SlotMeta>();
  // deno-lint-ignore no-explicit-any
  const slots: SlotInput[] = ((slotRows ?? []) as any[]).map((s) => {
    const surface = s.surfaces;
    const venue = surface.venues;
    slotMetaById.set(s.id, {
      slotId: s.id,
      surfaceId: surface.id,
      surfaceLabel: surface.label,
      venueId: venue.id,
      venueName: venue.name,
      startTsUtc: s.start_ts_utc,
      band: s.band,
    });
    return {
      slotId: s.id,
      surfaceId: surface.id,
      venueId: venue.id,
      startTsUtc: s.start_ts_utc,
      durationMin: s.duration_min,
      band: s.band,
      hourlyCostCents: s.hourly_cost_cents,
      isPlayoffReservation: s.is_playoff_reservation,
    };
  });

  // ===== 4. Load locked fixtures (pain #7 — never moved by the engine) =====
  const { data: lockedGames, error: lockedErr } = await sb
    .from("games")
    .select("id, home_team_id, away_team_id, slot_id")
    .eq("season_id", body.seasonId)
    .eq("division_id", body.divisionId)
    .not("locked_at", "is", null)
    .not("slot_id", "is", null);
  if (lockedErr) return json({ error: "load_locked_failed", detail: lockedErr.message }, 500);

  const lockedFixtures: LockedFixture[] = (lockedGames ?? []).map((g) => ({
    homeTeamId: g.home_team_id as string,
    awayTeamId: g.away_team_id as string,
    slotId: g.slot_id as string,
  }));

  // ===== 5. Build SolveRequest + input hash =====
  const seed = body.seed ?? crypto.randomUUID();
  const solveReq: SolveRequest = {
    seasonId: body.seasonId,
    divisionId: body.divisionId,
    teams,
    slots,
    lockedFixtures,
    gamesPerPair: body.gamesPerPair ?? 1,
    bandDefinitions: [
      // TODO: read these from season.config.timeSlotBands when the org-setup
      // wizard step lands. For now the slots already carry their band
      // denormalised, so the solver doesn't need this to function.
    ],
    weights: DEFAULT_WEIGHTS,
    maxLateFraction: body.maxLateFraction,
    timeLimitSeconds: body.timeLimitSeconds ?? 60,
    seed,
  };
  const inputHash = await sha256Hex(solveReq);

  // ===== 6. Insert schedule_runs (status='running') =====
  const { data: runRow, error: runInsertErr } = await sb
    .from("schedule_runs")
    .insert({
      season_id: body.seasonId,
      division_id: body.divisionId,
      engine: "cpsat",
      seed,
      input_hash: inputHash,
      constraint_snapshot: solveReq,
      status: "running",
      ran_by_user_id: userId,
    })
    .select("id")
    .single();
  if (runInsertErr || !runRow) {
    return json({ error: "schedule_run_insert_failed", detail: runInsertErr?.message }, 500);
  }
  const runId = runRow.id as string;

  // ===== 7. Call the solver =====
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

  // ===== 8. INFEASIBLE / TIMEOUT — record the report and bail out =====
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
    });
  }

  // ===== 9. OPTIMAL / FEASIBLE — persist =====
  // 9a. Delete prior generated-and-not-locked games for this scope.
  // The DB-level `WHERE locked_at IS NULL` is the sacred invariant —
  // locked fixtures NEVER leave.
  const { error: delErr } = await sb
    .from("games")
    .delete()
    .eq("season_id", body.seasonId)
    .eq("division_id", body.divisionId)
    .eq("source", "generated")
    .is("locked_at", null);
  if (delErr) {
    await sb.from("schedule_runs").update({
      status: "failed",
      infeasibility_report: { summary: `delete prior games failed: ${delErr.message}`, hardViolations: [], softViolations: [], unplacedGames: 0, placedGames: 0 },
    }).eq("id", runId);
    return json({ runId, status: "FAILED", error: delErr.message }, 500);
  }

  // 9b. Build games + game_provenance rows together with client-side
  // UUIDs so each provenance row references its game by id without an
  // ordering assumption on the insert's return shape.
  const gameRows: Record<string, unknown>[] = [];
  const provRows: Record<string, unknown>[] = [];
  for (const a of solveResp.assignments) {
    const meta = slotMetaById.get(a.slotId);
    if (!meta) continue; // defensive — solver returned a slot we didn't send
    const gameId = crypto.randomUUID();
    gameRows.push({
      id: gameId,
      league_id: season.league_id,
      season_id: body.seasonId,
      division_id: body.divisionId,
      sport_code: season.sport_code,
      home_team_id: a.homeTeamId,
      away_team_id: a.awayTeamId,
      scheduled_start_ts_utc: meta.startTsUtc,
      venue_name: meta.venueName,
      surface_label: meta.surfaceLabel,
      slot_id: meta.slotId,
      surface_id: meta.surfaceId,
      schedule_run_id: runId,
      source: "generated",
      time_band: meta.band,
      game_type: "regular",
      status: "scheduled",
      // locked_at intentionally NULL — engine output is never auto-locked.
      // published_at intentionally NULL — flip via scheduler-publish.
    });
    provRows.push({
      game_id: gameId,
      schedule_run_id: runId,
      placement_pass: "initial_assignment",
      constraint_ids: a.constraintIds,
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
    if (provErr) {
      // Not fatal for the schedule but we must surface it — provenance is
      // the explainability spine.
      console.error("provenance insert failed (games kept):", provErr);
    }
  }

  // 9c. Close out the schedule_runs row with the full solution
  // (decision #4 — determinism by persistence).
  await sb
    .from("schedule_runs")
    .update({
      status: "completed",
      solution: solveResp,
      objective_breakdown: solveResp.objectiveBreakdown,
      games_created: gameRows.length,
      games_locked_preserved: lockedFixtures.length,
      duration_ms: solveResp.solveTimeMs,
    })
    .eq("id", runId);

  return json({
    runId,
    status: solveResp.status,
    gamesCreated: gameRows.length,
    gamesLockedPreserved: lockedFixtures.length,
    solveTimeMs: solveResp.solveTimeMs,
  });
});
