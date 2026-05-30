import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { SchedulerEnv } from "./env.ts";

/**
 * Service-role client — bypasses RLS. Use ONLY inside the
 * scheduler-* Edge Functions where the caller's JWT has already been
 * validated by the platform (verify_jwt=true in supabase/config.toml).
 * Never expose the service-role key to a client browser.
 */
export function serviceRoleClient(env: SchedulerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
}
