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

/**
 * Path rewriter for the forms-builder package (BUG-043). The shared
 * @sportspulse/forms-builder calls /registration/forms/... and
 * /registration-v2/... — those endpoints are super_admin-only. The
 * org-admin proxy controller exposes the same handlers at /org-admin/*
 * with inline scope checks; rewriting here keeps the shared package
 * URL-agnostic.
 *
 * Method-aware for /league/seasons:
 *   - GET reads use the original path (AuthorizedAccessGuard already
 *     gates org-admin into their own seasons).
 *   - PATCH (and PUT) writes get redirected to /org-admin/seasons/:id
 *     so the proxy controller's @AllowScopedWrite + assertScope can
 *     run. Without this redirect, the Divisions & eligibility tab's
 *     "Save eligibility rules" save bombs with "Write operations
 *     require super_admin" (caught 2026-05-20).
 *
 * Reads on /league/divisions, /orgs/:id stay on their original paths.
 */
function rewriteForOrgAdmin(path: string, method: string): string {
  let out = path
    .replace(/^\/registration\/forms\b/, "/org-admin/forms")
    .replace(/^\/registration-v2\/pricing-tiers\b/, "/org-admin/pricing-tiers")
    .replace(/^\/registration-v2\/email-templates\b/, "/org-admin/email-templates")
    .replace(
      /^\/registration-v2\/pricing-tier-divisions\b/,
      "/org-admin/pricing-tier-divisions"
    );

  // Season config patches — this path is mutation-only, always proxy.
  out = out.replace(
    /^\/league\/seasons\/([^/?]+)\/config\b/,
    "/org-admin/seasons/$1/config"
  );

  // Bare season PATCH (rosterLockAt, name, dates). Only mutating
  // requests; the GET /league/seasons/:id read path stays put.
  if (
    (method === "PATCH" || method === "PUT") &&
    /^\/league\/seasons\/[^/?]+(\?|$)/.test(out)
  ) {
    out = out.replace(/^\/league\/seasons/, "/org-admin/seasons");
  }
  return out;
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

  const method = ((init?.method ?? "GET") + "").toUpperCase();
  const finalPath = rewriteForOrgAdmin(path, method);
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${API}${finalPath}`, {
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
export const orgs = api.orgs;
export const schedulingInventory = api.schedulingInventory;
export const orgAdminPersons = api.orgAdminPersons;
export const orgAdminTeams = api.orgAdminTeams;
export const orgAdminRefundAssessments = api.orgAdminRefundAssessments;
export const orgAdminLeagues = api.orgAdminLeagues;
export const orgAdminSeasons = api.orgAdminSeasons;
export const orgAdminDivisions = api.orgAdminDivisions;
export const orgAdminBroadcast = api.orgAdminBroadcast;
export const orgAdminFinance = api.orgAdminFinance;
export const orgAdminRegistrations = api.orgAdminRegistrations;

// Forms-builder shared package (BUG-043) consumes these namespaces via
// its React context. They hit super-admin-guarded endpoints today —
// the proxy/relax work in doc/bug-043-followup.md gates which calls
// will succeed for an org_admin caller.
export const registration = api.registration;
export const registrationV2 = api.registrationV2;
export const leagueMgmt = api.leagueMgmt;
