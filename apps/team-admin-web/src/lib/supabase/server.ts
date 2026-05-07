import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@sportspulse/auth/web";

/**
 * Per-app Supabase server client. Each new app has its own session
 * (separate cookies) per the repo owner directive — different sign-in
 * landing pages even though Supabase is the shared backend. Mirrors
 * apps/superadmin-web/src/lib/supabase/server.ts so the contract
 * stays uniform.
 */
export async function createClient() {
  const store = await cookies();
  return createSupabaseServerClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    cookies: {
      get(name) {
        return store.get(name)?.value;
      },
      set(name, value, options) {
        try {
          store.set({ name, value, ...options });
        } catch {
          // server components can't set cookies — middleware refreshes them
        }
      },
      remove(name, options) {
        try {
          store.set({ name, value: "", ...options });
        } catch {}
      }
    }
  });
}
