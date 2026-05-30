/**
 * Wire contract for the CP-SAT solver service.
 *
 * ====================================================================
 *  CANONICAL SOURCE OF TRUTH: packages/scheduler-core/src/contracts.ts
 *  PYTHON MIRROR:             apps/scheduler-solver/main.py (Pydantic)
 *  THIS FILE:                 Deno-runtime mirror for the orchestrator.
 *
 *  All three MUST stay in lockstep. If you change any field name,
 *  type, or enum value, you change all three in the same PR. The
 *  Pydantic validation in the solver will hard-fail the moment they
 *  drift, which is the failure mode we want.
 * ====================================================================
 *
 * Why a mirror and not a workspace import? Supabase Edge Functions run
 * on Deno and prefer URL/npm imports over cross-package workspace
 * paths. Re-typing 80 lines is cheaper than the cross-runtime build
 * dance; this comment + the Pydantic validator is our drift detector.
 */

export type TimeBand = "early" | "mid" | "late";

export interface TeamInput {
  teamId: string;
  divisionId: string;
  blackouts?: Array<{ startTsUtc: string; endTsUtc: string }>;
}

export interface SlotInput {
  slotId: string;
  surfaceId: string;
  venueId: string;
  startTsUtc: string;
  durationMin: number;
  band: TimeBand | null;
  hourlyCostCents: number;
  isPlayoffReservation: boolean;
}

export interface LockedFixture {
  homeTeamId: string;
  awayTeamId: string;
  slotId: string;
}

export interface SolverWeights {
  timeSlotFairness: number;
  homeAwayBalance: number;
  gapBalance: number;
}

export interface BandDefinition {
  band: TimeBand;
  startsAt?: string;
  endsBefore?: string;
}

export interface GameAssignment {
  homeTeamId: string;
  awayTeamId: string;
  slotId: string;
  constraintIds: string[];
}

export interface SolveRequest {
  seasonId: string;
  divisionId?: string;
  teams: TeamInput[];
  slots: SlotInput[];
  lockedFixtures: LockedFixture[];
  gamesPerPair: number;
  bandDefinitions: BandDefinition[];
  weights: SolverWeights;
  maxLateFraction?: number;
  timeLimitSeconds: number;
  seed: string;
  hint?: GameAssignment[];
}

export type SolveStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIMEOUT";

export interface ObjectiveBreakdown {
  timeslotFairnessDeviation: number;
  homeAwayImbalance: number;
  gapImbalance: number;
}

export interface InfeasibilityReport {
  summary: string;
  hardViolations: Array<{
    type: string;
    description: string;
    gamesAffected: string[];
    resolutionHint?: string;
  }>;
  softViolations: Array<{
    type: string;
    description: string;
    teamId?: string;
    targetPct?: number;
    achievableMinPct?: number;
    resolutionHint?: string;
  }>;
  unplacedGames: number;
  placedGames: number;
}

export interface SolveResponse {
  status: SolveStatus;
  assignments: GameAssignment[];
  objectiveValue: number;
  objectiveBreakdown: ObjectiveBreakdown;
  perTeamBandCounts: Record<string, Record<string, number>>;
  infeasibility?: InfeasibilityReport;
  solveTimeMs: number;
}

/** Default weights when the caller doesn't specify any. */
export const DEFAULT_WEIGHTS: SolverWeights = {
  timeSlotFairness: 1.0,
  homeAwayBalance: 1.0,
  gapBalance: 1.0,
};
