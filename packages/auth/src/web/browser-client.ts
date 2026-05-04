import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient(opts: {
  url: string;
  anonKey: string;
}) {
  return createBrowserClient(opts.url, opts.anonKey);
}
