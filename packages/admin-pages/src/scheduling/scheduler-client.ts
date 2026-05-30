"use client";

/**
 * Browser client for the scheduler Edge Functions on Supabase.
 *
 * Lives in @sportspulse/admin-pages so both superadmin-web and
 * org-admin-web (any future role-admin app) mount the same scheduler
 * components against the same wire contract. The supabase client is
 * built per-call using the host app's NEXT_PUBLIC_SUPABASE_URL /
 * _ANON_KEY env (the canonical browser-client factory in
 * @sportspulse/auth/web).
 *
 * Wire shapes mirror packages/scheduler-core/src/contracts.ts plus
 * each Edge Function's TS file. Pydantic on the solver and TS on the
 * orchestrator validate at the wire boundary so drift is caught.
 */

import { createSupabaseBrowserClient } from "@sportspulse/auth/web";
import type { SupabaseClient } from "@supabase/supabase-js";

function browserClient(): SupabaseClient {
  return createSupabaseBrowserClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  });
}

export interface GenerateRequest {
  seasonId: string;
  divisionId: string;
  gamesPerPair?: number;
  timeLimitSeconds?: number;
  seed?: string;
  maxLateFraction?: number;
}

export interface GenerateResponse {
  runId: string;
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIMEOUT" | "FAILED";
  gamesCreated: number;
  gamesLockedPreserved?: number;
  solveTimeMs?: number;
  infeasibility?: {
    summary: string;
    hardViolations: Array<{ type: string; description: string; resolutionHint?: string }>;
    softViolations: Array<{ type: string; description: string; teamId?: string }>;
    unplacedGames: number;
    placedGames: number;
  };
  error?: string;
}

export interface PublishRequest {
  seasonId: string;
  divisionId?: string;
  scheduleRunId?: string;
}

export interface PublishResponse {
  publishedAt: string;
  seasonId: string;
  divisionId: string | null;
  scheduleRunId: string | null;
  gamesPublished: number;
}

export interface FairnessRequest {
  seasonId: string;
  divisionId?: string;
  tolerance?: number;
  maxLateFraction?: number;
}

export interface FairnessResponse {
  seasonId: string;
  divisionId: string | null;
  teamCount: number;
  gameCount: number;
  report: {
    teams: Array<{
      teamId: string;
      counts: { early: number; mid: number; late: number };
      total: number;
      proportions: { early: number; mid: number; late: number };
      maxDeviation: number;
      lateFraction: number;
      exceedsTolerance: boolean;
    }>;
    leagueAverage: { early: number; mid: number; late: number };
    maxDeviation: number;
    toleranceMet: boolean;
  };
}

export type TiebreakerRule =
  | "head_to_head" | "wins" | "goal_diff"
  | "away_goals" | "home_goals" | "goals_for" | "goals_against";

export interface VerifyRequest {
  seasonId: string;
  divisionId?: string;
  ruleset: TiebreakerRule[];
}

export interface RankedTeamRow {
  teamId: string;
  teamName: string;
  rank: number;
  resolvedBy: "points" | TiebreakerRule | "teamId";
  note?: string;
}

export interface VerifyResponse {
  seasonId: string;
  divisionId: string | null;
  ruleset: TiebreakerRule[];
  staticWarnings: string[];
  teamCount: number;
  ranked: RankedTeamRow[];
  ambiguities: Array<{
    teamIds: string[];
    teamNames: string[];
    startingRank: number;
  }>;
  rulesetSufficient: boolean;
}

export interface ResolveRequest {
  seasonId: string;
  gameAId: string;
  gameBId: string;
}

export interface ResolveResponse {
  conflictKind: "slot_double_book" | "team_overlap" | "unknown";
  diagnosis: string;
  options: Array<{
    optionId: string;
    label: string;
    description: string;
    delta: {
      gameId: string;
      fromSlotId: string | null;
      toSlotId: string;
      toStartTsUtc: string;
      toSurfaceLabel: string;
      toVenueName: string;
    };
  }>;
  rejected: Array<{ slotId: string; reason: string }>;
}

export interface ConflictPair {
  gameAId: string;
  gameBId: string;
  kind: "team_overlap";
  sharedTeamIds: string[];
  sharedTeamNames: string[];
  gameAHome: string;
  gameAAway: string;
  gameBHome: string;
  gameBAway: string;
  gameAStart: string;
  gameBStart: string;
  divisionName: string | null;
  bothLocked: boolean;
  aLocked: boolean;
  bLocked: boolean;
}

export interface ListConflictsRequest {
  seasonId: string;
  divisionId?: string;
}

export interface ListConflictsResponse {
  seasonId: string;
  count: number;
  conflicts: ConflictPair[];
}

export interface ApplyConflictRequest {
  seasonId: string;
  gameId: string;
  toSlotId: string;
  reason?: string;
}

export interface ApplyConflictResponse {
  ok: true;
  gameId: string;
  newSlot: {
    id: string;
    surfaceLabel: string;
    venueName: string;
    startTsUtc: string;
  };
}

export interface ScheduleRunListItem {
  id: string;
  seasonId: string;
  divisionId: string | null;
  divisionName: string | null;
  engine: string;
  seed: string;
  inputHash: string;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  gamesCreated: number;
  gamesLockedPreserved: number;
  durationMs: number | null;
  ranByUserId: string | null;
  ranAt: string;
  infeasibilitySummary: string | null;
}

export interface ListRunsRequest {
  seasonId: string;
  divisionId?: string;
  limit?: number;
}

export interface ListRunsResponse {
  seasonId: string;
  divisionId: string | null;
  count: number;
  runs: ScheduleRunListItem[];
}

// Pain #2 — rink notifications wire shapes.
export interface RinkIntegrationView {
  id: string;
  venueId: string;
  venueName: string;
  kind: string;
  endpointUrl: string | null;
  active: boolean;
  circuitState: string;
  failureCount: number;
  lastDeliveryAt: string | null;
  lastFailureAt: string | null;
}

export interface RinkOutboxView {
  id: string;
  gameId: string | null;
  rinkIntegrationId: string;
  venueName: string | null;
  eventType: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface ListRinkNotificationsRequest {
  seasonId: string;
  limit?: number;
}

export interface ListRinkNotificationsResponse {
  seasonId: string;
  integrations: RinkIntegrationView[];
  outbox: RinkOutboxView[];
}

export interface DispatchRinkNotificationsRequest {
  gameIds: string[];
  eventType:
    | "game_scheduled"
    | "game_rescheduled"
    | "game_cancelled"
    | "game_postponed";
  dryRun?: boolean;
}

export interface DispatchRinkNotificationsResponse {
  enqueued: number;
  alreadyEnqueued: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  noVenue: number;
  noIntegration: number;
}

// Pain #6 — parity windows wire shapes.
export interface ParityWindowView {
  id: string;
  seasonId: string;
  windowIndex: number;
  startDate: string;
  endDate: string;
  reviewDueDate: string | null;
  state: "pending" | "review_open" | "applied" | "skipped" | "archived";
  recommendationsCount: number;
  decisionsCount: number;
  appliedAt: string | null;
  createdAt: string;
}

export interface ListParityWindowsRequest { seasonId: string }
export interface ListParityWindowsResponse {
  seasonId: string;
  count: number;
  windows: ParityWindowView[];
}

export interface ParityRecommendation {
  teamId: string;
  teamName: string;
  currentDivisionId: string;
  currentDivisionName: string;
  currentTier: string | null;
  recommendation: "move_up" | "stay" | "move_down";
  reasoning: string;
  targetDivisionId: string | null;
  targetDivisionName: string | null;
  points: number;
  rankInDivision: number;
  divisionSize: number;
}

export interface ComputeParityRequest {
  seasonId: string;
  windowId: string;
  topFraction?: number;
  bottomFraction?: number;
}

export interface ComputeParityResponse {
  windowId: string;
  state: string;
  recommendations: ParityRecommendation[];
  summary: { moveUp: number; stay: number; moveDown: number };
}

export interface ParityDecision {
  teamId: string;
  targetDivisionId: string;
}

export interface ApplyParityRequest {
  seasonId: string;
  windowId: string;
  decisions: ParityDecision[];
}

export interface ApplyParityResponse {
  windowId: string;
  state: string;
  movesApplied: number;
  divisionsRegenerated: string[];
}

// Pain #3 — playoff brackets wire shapes.
export interface BracketSlotView {
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

export interface BracketView {
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

export interface ListBracketsRequest { seasonId: string }
export interface ListBracketsResponse {
  seasonId: string;
  brackets: BracketView[];
}

export interface GenerateBracketRequest {
  seasonId: string;
  divisionId: string;
  format?: "single_elim";
  topN?: 4 | 8 | 16;
}

export interface GenerateBracketResponse {
  bracketId: string;
  state: string;
  topN: number;
  slots: BracketSlotView[];
}

export interface AdvanceBracketRequest {
  bracketId: string;
  gameId: string;
  winnerTeamId: string;
}

export interface AdvanceBracketResponse {
  bracketId: string;
  bracketState: string;
  updatedSlot: { round: number; position: number };
  nextSlot: { round: number; position: number; gameId: string | null } | null;
  nextGameCreated: boolean;
}

// Pain #4 — dynamic tournament tiers wire shapes (Johnny's ask).
export type TournamentTier = "upper" | "middle" | "lower";

export interface TournamentTierAssignmentView {
  teamId: string;
  teamName: string;
  tier: TournamentTier;
  reasoning: string | null;
}

export interface TournamentRoundView {
  id: string;
  seasonId: string;
  roundIndex: number;
  label: string | null;
  state: string;
  startsAt: string | null;
  endsAt: string | null;
  assignments: TournamentTierAssignmentView[];
  fixtureCount: number;
  completedCount: number;
  createdAt: string;
}

export interface ListTournamentRoundsRequest { seasonId: string }
export interface ListTournamentRoundsResponse {
  seasonId: string;
  count: number;
  rounds: TournamentRoundView[];
}

export interface InitTournamentRoundRequest {
  seasonId: string;
  divisionId: string;
  roundIndex: number;
  label?: string;
  startsAt?: string;
  endsAt?: string;
  assignments: Array<{ teamId: string; tier: TournamentTier }>;
}

export interface InitTournamentRoundResponse {
  roundId: string;
  roundIndex: number;
  state: string;
  fixturesCreated: number;
  perTier: Record<TournamentTier, number>;
}

export interface TournamentAdvanceAssignment {
  teamId: string;
  teamName: string;
  fromTier: TournamentTier;
  toTier: TournamentTier;
  wins: number;
  losses: number;
  rankInTier: number;
  tierSize: number;
  reasoning: string;
}

export interface AdvanceTournamentRoundRequest {
  seasonId: string;
  fromRoundId: string;
  newLabel?: string;
  newStartsAt?: string;
  newEndsAt?: string;
  topFraction?: number;
  bottomFraction?: number;
}

export interface AdvanceTournamentRoundResponse {
  newRoundId: string;
  newRoundIndex: number;
  state: string;
  assignments: TournamentAdvanceAssignment[];
  fixturesCreated: number;
  perTier: Record<TournamentTier, number>;
}

async function invoke<TReq, TRes>(name: string, body: TReq): Promise<TRes> {
  const sb = browserClient();
  const { data, error } = await sb.functions.invoke<TRes>(name, {
    body: body as Record<string, unknown>
  });
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError where `context` is
    // the raw Response. The Edge Function's body is `{"error": "..."}` —
    // pull that out so the UI surfaces the real reason ("scheduler.run
    // permission required") instead of the generic SDK wrapping
    // ("Edge Function returned a non-2xx status code").
    const ctx = (error as { context?: unknown }).context;
    let extracted: string | null = null;
    if (ctx instanceof Response) {
      try {
        const parsed = (await ctx.clone().json()) as { error?: unknown };
        if (parsed && typeof parsed.error === "string") {
          extracted = parsed.error;
        }
      } catch {
        // body wasn't JSON; fall through
      }
    }
    const msg =
      extracted ??
      (error as { message?: string })?.message ??
      "Unknown scheduler error";
    throw new Error(String(msg));
  }
  return data as TRes;
}

export const scheduler = {
  generate: (req: GenerateRequest) =>
    invoke<GenerateRequest, GenerateResponse>("scheduler-generate", req),
  publish: (req: PublishRequest) =>
    invoke<PublishRequest, PublishResponse>("scheduler-publish", req),
  fairnessReport: (req: FairnessRequest) =>
    invoke<FairnessRequest, FairnessResponse>("scheduler-fairness-report", req),
  verify: (req: VerifyRequest) =>
    invoke<VerifyRequest, VerifyResponse>("scheduler-verify", req),
  resolveConflict: (req: ResolveRequest) =>
    invoke<ResolveRequest, ResolveResponse>("scheduler-conflict-resolve", req),
  listConflicts: (req: ListConflictsRequest) =>
    invoke<ListConflictsRequest, ListConflictsResponse>("scheduler-conflicts-list", req),
  applyConflictResolution: (req: ApplyConflictRequest) =>
    invoke<ApplyConflictRequest, ApplyConflictResponse>("scheduler-conflict-apply", req),
  listRuns: (req: ListRunsRequest) =>
    invoke<ListRunsRequest, ListRunsResponse>("scheduler-runs-list", req),
  listRinkNotifications: (req: ListRinkNotificationsRequest) =>
    invoke<ListRinkNotificationsRequest, ListRinkNotificationsResponse>(
      "rink-notifications-list",
      req
    ),
  dispatchRinkNotifications: (req: DispatchRinkNotificationsRequest) =>
    invoke<DispatchRinkNotificationsRequest, DispatchRinkNotificationsResponse>(
      "rink-notify-dispatch",
      req
    ),
  listParityWindows: (req: ListParityWindowsRequest) =>
    invoke<ListParityWindowsRequest, ListParityWindowsResponse>(
      "scheduler-parity-windows-list",
      req
    ),
  computeParityWindow: (req: ComputeParityRequest) =>
    invoke<ComputeParityRequest, ComputeParityResponse>(
      "scheduler-parity-window-compute",
      req
    ),
  applyParityWindow: (req: ApplyParityRequest) =>
    invoke<ApplyParityRequest, ApplyParityResponse>(
      "scheduler-parity-window-apply",
      req
    ),
  listBrackets: (req: ListBracketsRequest) =>
    invoke<ListBracketsRequest, ListBracketsResponse>(
      "scheduler-brackets-list",
      req
    ),
  generateBracket: (req: GenerateBracketRequest) =>
    invoke<GenerateBracketRequest, GenerateBracketResponse>(
      "scheduler-bracket-generate",
      req
    ),
  advanceBracket: (req: AdvanceBracketRequest) =>
    invoke<AdvanceBracketRequest, AdvanceBracketResponse>(
      "scheduler-bracket-advance",
      req
    ),
  listTournamentRounds: (req: ListTournamentRoundsRequest) =>
    invoke<ListTournamentRoundsRequest, ListTournamentRoundsResponse>(
      "scheduler-tournament-rounds-list",
      req
    ),
  initTournamentRound: (req: InitTournamentRoundRequest) =>
    invoke<InitTournamentRoundRequest, InitTournamentRoundResponse>(
      "scheduler-tournament-round-init",
      req
    ),
  advanceTournamentRound: (req: AdvanceTournamentRoundRequest) =>
    invoke<AdvanceTournamentRoundRequest, AdvanceTournamentRoundResponse>(
      "scheduler-tournament-round-advance",
      req
    )
};

/** Browser supabase client used for Realtime channel subscriptions. */
export function createSchedulerSupabaseClient(): SupabaseClient {
  return browserClient();
}
