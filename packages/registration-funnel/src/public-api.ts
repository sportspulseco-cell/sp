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
    // Pull the human-readable message out of the API's error envelope
    // instead of throwing the raw JSON at the user (BUG-045, parallel
    // to BUG-008 fix in the admin apps). The envelope is one of:
    //   { error: { code, message } }  ← canonical (DomainExceptionFilter)
    //   { message, error, statusCode } ← Nest default
    let msg = `API ${res.status}`;
    let parsed: unknown = null;
    const body = await res.text();
    try {
      parsed = JSON.parse(body);
    } catch {}
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      const inner = (p.error ?? {}) as Record<string, unknown>;
      const innerMsg = typeof inner.message === "string" ? inner.message : null;
      const topMsg = typeof p.message === "string" ? p.message : null;
      const innerCode = typeof inner.code === "string" ? inner.code : null;
      msg = innerMsg ?? topMsg ?? innerCode ?? msg;
    } else if (body) {
      msg = `${msg}: ${body}`;
    }
    const err = new Error(msg) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = res.status;
    err.body = parsed ?? body;
    throw err;
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
      /** P2-2: division the player is registering into. */
      divisionId?: string;
      answers?: Record<string, unknown>;
      /** Form version the funnel rendered; the API binds to it (REG-8). */
      formVersionId?: string;
      /** Team registration only — captured on the Team information card. */
      teamName?: string;
      teamColor?: string;
      /** FR-3.4.1: join this team when the registration is approved. */
      teamId?: string;
      /** The captain invite the player followed. */
      inviteToken?: string;
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
    body: {
      email: string;
      password: string;
      submissionType?: SubmissionType;
      /** Form version the funnel rendered; the API binds to it (REG-8). */
      formVersionId?: string;
      teamId?: string;
      inviteToken?: string;
    }
  ): Promise<{
    id: string;
    status: string;
    resumed: boolean;
    userId: string;
    userCreated: false;
    isMinor: boolean;
    fullName: string;
    // Resume-only: hydrate the funnel from prior submission state so the
    // Details step doesn't render blank for returning users. Omitted on
    // the create-new branch (no prior row to load from).
    dobDate?: string | null;
    phone?: string | null;
    answers?: Record<string, unknown>;
    pricingTierId?: string | null;
    divisionId?: string | null;
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
    teamId: string | null;
    divisionId: string | null;
  }>;
  /** FR-3.4.5: store the file for one file-upload question (base64, 3 MB max). */
  uploadFormFile(
    submissionId: string,
    body: { email: string; questionKey: string; fileName: string; dataBase64: string }
  ): Promise<{ value: string; fileName: string; contentType: string; sizeBytes: number }>;
  cancelSubmission(
    id: string,
    email: string
  ): Promise<{ id: string; status: "cancelled" }>;
  /**
   * Persist later-stage funnel input back onto the registration row.
   * Called at Details → Compliance (with answers) and at Pay (with
   * pricingTierId) so the row reflects what the player actually
   * entered. Without it, every Details-step field lives in client
   * state only and the pay/approve handlers see {} for answers.
   */
  updateSubmission(
    id: string,
    body: {
      email: string;
      answers?: Record<string, unknown>;
      pricingTierId?: string | null;
      teamName?: string | null;
      teamColor?: string | null;
      divisionId?: string | null;
      /** ISO YYYY-MM-DD. Editable inline on the Details step for
       * returning users who never set a DOB at sign-up. Server recomputes
       * isMinor and the parental-consent step from this value. */
      dobDate?: string | null;
    }
  ): Promise<{
    id: string;
    updated: boolean;
    /** Current status; `pending_consent` when the DOB shows a minor without guardian consent. */
    status?: string;
    isMinor?: boolean;
  }>;
  /** Season preview of the documents a registrant will sign (no signed state). */
  listWaivers(seasonId: string): Promise<{
    requiredKinds: string[];
    documents: WaiverDoc[];
  }>;
  /**
   * The documents this registration must have signed before it can be
   * submitted, with the registrant's signed state (REG-5). `signerName`
   * is the name the registrant types to sign.
   */
  listSubmissionWaivers(
    submissionId: string,
    email: string
  ): Promise<{
    signerName: string;
    requiredKinds: string[];
    documents: WaiverDoc[];
  }>;
  signWaiver(
    submissionId: string,
    body: {
      email: string;
      /** Requirement key (liability_waiver | code_of_conduct). */
      key?: string;
      /** Legacy handle (`form:<kind>` or a stored version id). */
      documentVersionId?: string;
      signatureName: string;
    }
  ): Promise<{
    signatureId: string;
    documentVersionId: string;
    signedAt: string;
    alreadySigned: boolean;
    outstandingRequired: number;
    outstanding: Array<{ key: string; name: string }>;
  }>;
  startParentalConsent(
    submissionId: string,
    body: { email: string; parentEmail: string }
  ): Promise<{
    /** Null when the email was sent; the link is only for the guardian. */
    consentToken: string | null;
    emailDelivered: boolean;
    /** Copy/paste fallback, only when email delivery is not configured. */
    mockConsentMessage: { to: string; subject: string; body: string } | null;
  }>;
  /** Checks whether the guardian has confirmed; 409 while still waiting. */
  confirmParentalConsent(
    submissionId: string,
    body: { email: string }
  ): Promise<{ id: string; status: string }>;
  /**
   * Anonymous: look up a parent-consent token and return display
   * context for the parent portal. No Supabase auth — token is auth.
   */
  getParentalConsentContext(token: string): Promise<{
    submissionId: string;
    status: string;
    childDisplayName: string;
    seasonName: string | null;
    orgName: string | null;
    expired: boolean;
    confirmedAt: string | null;
  }>;
  /**
   * Anonymous: parent confirms or declines via the portal. 410
   * (ConflictException) when the token is older than 24h.
   */
  redeemParentalConsent(
    token: string,
    body: { action: "confirm" | "decline" }
  ): Promise<{ submissionId: string; status: string }>;
  runEligibilityCheck(
    submissionId: string,
    email: string
  ): Promise<{ passed: boolean; flags: string[] }>;
  pay(
    submissionId: string,
    body: {
      email: string;
      mockOutcome?: "succeeded" | "failed" | "offline";
      /** "plan": deposit today, the rest in installments. */
      paymentOption?: "full" | "plan";
    }
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
    uploadFormFile: (id, body) =>
      f(`/public/registration/submissions/${id}/files`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    cancelSubmission: (id, email) =>
      f(`/public/registration/submissions/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ email })
      }),
    updateSubmission: (id, body) =>
      f(`/public/registration/submissions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      }),
    listWaivers: (id) =>
      f(`/public/registration/seasons/${id}/waivers`),
    listSubmissionWaivers: (id, email) =>
      f(`/public/registration/submissions/${id}/waivers${qs({ email })}`),
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
    getParentalConsentContext: (token) =>
      f(`/public/registration/parental-consent/${token}`),
    redeemParentalConsent: (token, body) =>
      f(`/public/registration/parental-consent/${token}/redeem`, {
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
