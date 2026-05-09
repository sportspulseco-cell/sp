"use client";

import type {
  PublicSeasonContext,
  SubmissionType,
  WaiverDoc
} from "./types";

/**
 * Anonymous fetcher for the public registration funnel. No Supabase
 * session, no Authorization header. The API side pins these endpoints
 * to controllers that do NOT mount AuthorizedAccessGuard.
 *
 * Caller passes the API base URL. Apps that consume this package
 * resolve it from `process.env.NEXT_PUBLIC_API_URL` and call
 * `createPublicRegistration(apiUrl)` to get a bound SDK.
 */
async function apiFetch<T = unknown>(
  apiUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${apiUrl}${path}`, {
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

const qs = (q: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export interface PublicRegistrationApi {
  getSeasonContext(seasonId: string): Promise<PublicSeasonContext>;
  startSubmission(
    seasonId: string,
    body: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      dobDate?: string;
      pricingTierId?: string;
      submissionType?: SubmissionType;
      answers?: Record<string, unknown>;
    }
  ): Promise<{
    id: string;
    status: string;
    resumed: boolean;
    userId: string;
    userCreated: boolean;
    isMinor: boolean;
  }>;
  /**
   * Alt sign-in path for the funnel's "Already have an account?" card.
   * Looks up the existing user by email and find-or-creates the
   * registration row keyed on (email, season, submissionType).
   * Errors when no auth user exists for that email.
   */
  resumeSubmission(
    seasonId: string,
    body: { email: string; submissionType?: SubmissionType }
  ): Promise<{
    id: string;
    status: string;
    resumed: boolean;
    userId: string;
    userCreated: false;
    isMinor: boolean;
    fullName: string;
  }>;
  getSubmission(
    id: string,
    email: string
  ): Promise<{
    id: string;
    status: string;
    submissionType: string;
    pricingTierId: string | null;
    email: string;
    fullName: string | null;
    phone: string | null;
    dobDate: string | null;
    isMinor: boolean;
    answers: Record<string, unknown>;
  }>;
  cancelSubmission(
    id: string,
    email: string
  ): Promise<{ id: string; status: "cancelled" }>;
  listWaivers(seasonId: string): Promise<{
    requiredKinds: string[];
    documents: WaiverDoc[];
  }>;
  signWaiver(
    submissionId: string,
    body: { email: string; documentVersionId: string; signatureName: string }
  ): Promise<{ signatureId: string; outstandingRequired: number }>;
  startParentalConsent(
    submissionId: string,
    body: { email: string; parentEmail: string }
  ): Promise<{
    consentToken: string;
    mockConsentMessage: { to: string; subject: string; body: string };
  }>;
  confirmParentalConsent(
    submissionId: string,
    body: { email: string; consentToken: string }
  ): Promise<{ id: string; status: "pending_payment" }>;
  runEligibilityCheck(
    submissionId: string,
    email: string
  ): Promise<{ passed: boolean; flags: string[] }>;
  pay(
    submissionId: string,
    body: { email: string; mockOutcome?: "succeeded" | "failed" | "offline" }
  ): Promise<{
    id: string;
    status: "pending_review" | "pending_payment" | "pending_offline";
    invoiceId: string | null;
    amountCents?: number;
    currency?: string;
    mock: boolean;
    declineReason?: string;
  }>;
}

/**
 * Build a public-registration API client bound to an API base URL.
 * Each consuming app calls this once with its own NEXT_PUBLIC_API_URL.
 */
export function createPublicRegistration(apiUrl: string): PublicRegistrationApi {
  const f = <T>(p: string, init?: RequestInit) => apiFetch<T>(apiUrl, p, init);
  return {
    getSeasonContext: (id) =>
      f<PublicSeasonContext>(`/public/registration/seasons/${id}`),
    startSubmission: (id, body) =>
      f(`/public/registration/seasons/${id}/submissions`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    resumeSubmission: (id, body) =>
      f(`/public/registration/seasons/${id}/resume`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    getSubmission: (id, email) =>
      f(`/public/registration/submissions/${id}${qs({ email })}`),
    cancelSubmission: (id, email) =>
      f(`/public/registration/submissions/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ email })
      }),
    listWaivers: (id) =>
      f(`/public/registration/seasons/${id}/waivers`),
    signWaiver: (id, body) =>
      f(`/public/registration/submissions/${id}/sign-waiver`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    startParentalConsent: (id, body) =>
      f(`/public/registration/submissions/${id}/parental-consent/start`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    confirmParentalConsent: (id, body) =>
      f(`/public/registration/submissions/${id}/parental-consent/confirm`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    runEligibilityCheck: (id, email) =>
      f(`/public/registration/submissions/${id}/eligibility-check`, {
        method: "POST",
        body: JSON.stringify({ email })
      }),
    pay: (id, body) =>
      f(`/public/registration/submissions/${id}/pay`, {
        method: "POST",
        body: JSON.stringify(body)
      })
  };
}
