/**
 * Typed env loader — fails loud on missing required vars.
 *
 * Edge Functions auto-provide SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 * SOLVER_URL and SOLVER_API_KEY are set via `supabase secrets set`.
 */
export interface SchedulerEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  solverUrl: string;
  solverApiKey: string | null;
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `Missing required env: ${name}. Set via 'supabase secrets set ${name}=...'`
    );
  }
  return v;
}

export function loadEnv(): SchedulerEnv {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    solverUrl: required("SOLVER_URL"),
    solverApiKey: Deno.env.get("SOLVER_API_KEY") ?? null,
  };
}
