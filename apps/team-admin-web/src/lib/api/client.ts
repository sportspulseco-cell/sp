import "server-only";
import { createClient } from "@/lib/supabase/server";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Server-side fetch wrapper. Pulls the Supabase access token from the
 * cookie session and attaches it as Bearer. Used by server components +
 * route handlers.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const supabase = await createClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!res.ok) {
    // Surface the server's human message instead of dumping raw
    // JSON to the user (BUG-008). Nest returns { error: { code,
    // message } } or { message, statusCode } — pick the human bit.
    const body = await res.text();
    let msg = `API ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      const human =
        parsed?.error?.message ?? parsed?.message ?? parsed?.error;
      if (typeof human === "string" && human.length > 0) msg = human;
      else if (typeof parsed?.error === "object" && parsed.error?.code) {
        msg = String(parsed.error.code);
      }
    } catch {
      // not JSON — keep fallback
    }
    const err = new Error(msg) as Error & {
      status?: number;
      body?: string;
    };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return (await res.json()) as T;
}
