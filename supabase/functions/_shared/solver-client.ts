import type { SolveRequest, SolveResponse } from "./contracts.ts";
import type { SchedulerEnv } from "./env.ts";

/**
 * Thin client around the CP-SAT solver service.
 * Lives at SOLVER_URL on Hugging Face Spaces. Authenticated with
 * X-API-Key when SOLVER_API_KEY is configured.
 *
 * On a non-2xx response, throws SolverError with the response body —
 * the orchestrator surfaces this to the admin and stores it on the
 * schedule_runs.infeasibility_report row.
 */
export class SolverError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "SolverError";
  }
}

export async function callSolver(
  env: SchedulerEnv,
  req: SolveRequest,
  signal?: AbortSignal,
): Promise<SolveResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.solverApiKey) headers["X-API-Key"] = env.solverApiKey;

  const res = await fetch(`${env.solverUrl}/solve`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new SolverError(
      `Solver responded ${res.status}`,
      res.status,
      text,
    );
  }
  const result = JSON.parse(text) as SolveResponse;
  const required = ["team_blackouts", "late_cap", "weekly_cap", "preferences", "fairness_objective"];
  if (!required.every(cap => result.capabilities?.includes(cap))) {
    throw new SolverError("The deployed solver needs updating before it can enforce these scheduling rules.", 503, "solver_capabilities_missing");
  }
  return result;
}

export async function solverHealthy(env: SchedulerEnv): Promise<boolean> {
  try {
    const res = await fetch(`${env.solverUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
