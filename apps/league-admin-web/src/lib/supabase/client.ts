import { createSupabaseBrowserClient } from "@sportspulse/auth/web";

export const createClient = () =>
  createSupabaseBrowserClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  });
