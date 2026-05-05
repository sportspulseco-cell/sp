"use client";

import { createApi } from "./sdk";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Anonymous fetcher for the public registration funnel.
 *
 * No Supabase session, no Authorization header. Used by routes under
 * /registration that any visitor can hit before signing in. The API side
 * pins these to controllers that do NOT mount AuthorizedAccessGuard.
 */
async function apiFetchPublic<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

const api = createApi(apiFetchPublic);

export const publicRegistration = api.publicRegistration;
