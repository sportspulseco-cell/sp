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

async function invoke<TReq, TRes>(name: string, body: TReq): Promise<TRes> {
  const sb = browserClient();
  const { data, error } = await sb.functions.invoke<TRes>(name, {
    body: body as Record<string, unknown>
  });
  if (error) {
    const ctx = error as { context?: { error?: string }; message?: string };
    const msg = ctx?.context?.error ?? ctx?.message ?? "Unknown scheduler error";
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
    )
};

/** Browser supabase client used for Realtime channel subscriptions. */
export function createSchedulerSupabaseClient(): SupabaseClient {
  return browserClient();
}
