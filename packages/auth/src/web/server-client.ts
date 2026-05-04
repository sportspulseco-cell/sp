import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Next.js App Router server-side Supabase client.
// Pass in `cookies()` from `next/headers` at the call site.
export function createSupabaseServerClient(opts: {
  url: string;
  anonKey: string;
  cookies: {
    get(name: string): string | undefined;
    set?(name: string, value: string, options: CookieOptions): void;
    remove?(name: string, options: CookieOptions): void;
  };
}) {
  return createServerClient(opts.url, opts.anonKey, {
    cookies: {
      get(name: string) {
        return opts.cookies.get(name);
      },
      set(name: string, value: string, options: CookieOptions) {
        opts.cookies.set?.(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        opts.cookies.remove?.(name, options);
      }
    }
  });
}
