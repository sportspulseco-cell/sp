import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

// Refreshes the Supabase session in Next.js middleware so cookies stay fresh.
export async function refreshSupabaseSession(opts: {
  url: string;
  anonKey: string;
  request: NextRequest;
  response: NextResponse;
}) {
  const supabase = createServerClient(opts.url, opts.anonKey, {
    cookies: {
      get(name: string) {
        return opts.request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        opts.response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        opts.response.cookies.set({ name, value: "", ...options });
      }
    }
  });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return { supabase, user };
}
