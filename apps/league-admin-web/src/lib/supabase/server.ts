import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@sportspulse/auth/web";

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
