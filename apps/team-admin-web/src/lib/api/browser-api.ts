"use client";

import { createApi } from "@sportspulse/api-client";
import { createClient } from "@/lib/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

function redirectToSignIn(reason: "session_expired" | "signed_out") {
  if (typeof window === "undefined") return;
  const next = encodeURIComponent(
    window.location.pathname + window.location.search
  );
  window.location.assign(`/sign-in?error=${reason}&next=${next}`);
}

async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    redirectToSignIn("signed_out");
    throw new Error("Not authenticated");
  }

  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {})
    }
  });

  if (res.status === 401) {
    await supabase.auth.signOut().catch(() => undefined);
    redirectToSignIn("session_expired");
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

const api = createApi(apiFetch);

// Re-export the SDK namespaces this app actually uses. Add more as
// the app grows. Same pattern as superadmin-web/league-admin-web.
export const iam = api.iam;
export const leagueMgmt = api.leagueMgmt;
export const roster = api.roster;
export const registrationV2 = api.registrationV2;
export const communications = api.communications;
export const captain = api.captain;
export const compliance = api.compliance;
