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

const api = createApi(apiFetch);

// Re-export the SDK namespaces this app actually uses. Add more as
// the app grows. Same pattern as superadmin-web.
export const iam = api.iam;
export const orgAdminTeams = api.orgAdminTeams;
export const orgAdminRefundAssessments = api.orgAdminRefundAssessments;
export const orgAdminLeagues = api.orgAdminLeagues;
export const orgAdminSeasons = api.orgAdminSeasons;
export const orgAdminDivisions = api.orgAdminDivisions;
export const orgAdminBroadcast = api.orgAdminBroadcast;
export const orgAdminFinance = api.orgAdminFinance;
export const orgAdminRegistrations = api.orgAdminRegistrations;
