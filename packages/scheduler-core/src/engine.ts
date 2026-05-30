/**
 * SchedulerEngine — the abstraction that lets the orchestrator swap
 * backends without rewriting anything above it. The CP-SAT service is
 * the primary backend (locked decision #1); a greedy in-process engine
 * remains possible behind the same interface for local dev / fallback.
 *
 * (synthesis doc, Fight #1 — "abstract the engine behind a
 * SchedulerEngine interface".)
 */
import type { SolveRequest, SolveResponse } from "./contracts";

export type SchedulerEngineKind = "cpsat" | "greedy";

export interface SchedulerEngine {
  readonly kind: SchedulerEngineKind;

  /** Generate (or regenerate, via request.hint) a schedule. */
  solve(request: SolveRequest): Promise<SolveResponse>;

  /** Liveness probe — used by the orchestrator's health check. */
  ping(): Promise<boolean>;
}
