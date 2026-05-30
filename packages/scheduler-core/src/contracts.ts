/**
 * Solver wire contract — the request/response shape exchanged between the
 * scheduling-api orchestrator (TypeScript) and the CP-SAT solver service
 * (Python/FastAPI). Both sides serialise to/from these types, so they are
 * the integration boundary. Keep field names stable.
 */
import type { ConstraintId, TimeBand } from "./constraints";

/** A team participating in the solve, with its target/budget knobs. */
export interface TeamInput {
  teamId: string;
  divisionId: string;
  /** Hard exclusion windows (tournament travel, blackouts) as UTC ISO ranges. */
  blackouts?: Array<{ startTsUtc: string; endTsUtc: string }>;
}

/** A bookable ice slot the solver may assign a fixture to. */
export interface SlotInput {
  slotId: string;
  surfaceId: string;
  venueId: string;
  startTsUtc: string;
  durationMin: number;
  band: TimeBand | null;
  hourlyCostCents: number;
  /** Reserved for playoffs — excluded from regular-season generation. */
  isPlayoffReservation: boolean;
}

/** A fixture pinned to a specific slot — never moved (locked / manual import). */
export interface LockedFixture {
  homeTeamId: string;
  awayTeamId: string;
  slotId: string;
}

/** Relative weights for the soft-constraint objective terms. */
export interface SolverWeights {
  timeSlotFairness: number;
  homeAwayBalance: number;
  gapBalance: number;
}

export interface SolveRequest {
  seasonId: string;
  divisionId?: string;
  teams: TeamInput[];
  slots: SlotInput[];
  lockedFixtures: LockedFixture[];
  /** Each unordered pair plays this many times (1 = single round-robin). */
  gamesPerPair: number;
  bandDefinitions: BandDefinition[];
  weights: SolverWeights;
  /** Hard cap, e.g. "no team has more than 30% of games after 9pm". */
  maxLateFraction?: number;
  timeLimitSeconds: number;
  seed: string;
  /** Warm-start hint from a prior solution (parity regen / conflict repair). */
  hint?: GameAssignment[];
}

/** Band boundaries; `band` applies to slots starting in [startsAt, endsBefore). */
export interface BandDefinition {
  band: TimeBand;
  startsAt?: string; // "HH:mm" local; omit for open-ended early band
  endsBefore?: string; // "HH:mm" local; omit for open-ended late band
}

export interface GameAssignment {
  homeTeamId: string;
  awayTeamId: string;
  slotId: string;
  /** Which constraints drove this placement — feeds game_provenance. */
  constraintIds: ConstraintId[];
}

export type SolveStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIMEOUT";

export interface ObjectiveBreakdown {
  timeslotFairnessDeviation: number;
  homeAwayImbalance: number;
  gapImbalance: number;
}

/** Minimal subset of constraints proven jointly unsatisfiable (Z3/CP-SAT). */
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
  /** team → band → count, for the fairness report. */
  perTeamBandCounts: Record<string, Record<string, number>>;
  infeasibility?: InfeasibilityReport;
  solveTimeMs: number;
}
