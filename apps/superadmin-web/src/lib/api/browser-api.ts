"use client";

import { createClient } from "@/lib/supabase/client";
import { createApi } from "./sdk";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

function redirectToSignIn(reason: "session_expired" | "signed_out") {
  if (typeof window === "undefined") return;
  const next = encodeURIComponent(
    window.location.pathname + window.location.search
  );
  window.location.assign(`/sign-in?error=${reason}&next=${next}`);
}

async function apiFetchBrowser<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  // Already-expired client session — kick to sign-in before issuing the call.
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
    // Token rejected — session likely expired server-side. Sign out + bounce.
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

const api = createApi(apiFetchBrowser);

export const iam = api.iam;
export const orgs = api.orgs;
export const leagueMgmt = api.leagueMgmt;
export const registration = api.registration;
export const roster = api.roster;
export const gameOps = api.gameOps;
export const stats = api.stats;
export const compliance = api.compliance;
export const communications = api.communications;
export const audit = api.audit;
export const finance = api.finance;
export const admin = api.admin;
export const crossOrgGrants = api.crossOrgGrants;
export const dataMigration = api.dataMigration;
export const registrationV2 = api.registrationV2;
