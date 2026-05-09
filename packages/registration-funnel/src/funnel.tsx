"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { AnswerMap } from "@sportspulse/kernel";
import type { PublicRegistrationApi } from "./public-api";
import type { PublicSeasonContext, PricingTier, SubmissionType, WaiverDoc } from "./types";
import { Button, Chip, Field, Input } from "@sportspulse/ui";
import { FormRenderer } from "./form-renderer";

type Step =
  | "path"
  | "account"
  | "consent"
  | "waivers"
  | "tier"
  | "questions"
  | "review"
  | "payment"
  | "done";


const PATHS: {
  value: SubmissionType;
  title: string;
  blurb: string;
  icon: string;
  iconBg: string;
}[] = [
  {
    value: "team",
    title: "Register a team",
    blurb: "I am a captain registering my team for this season",
    icon: "🛡️",
    iconBg: "bg-blue-500/15"
  },
  {
    value: "individual",
    title: "Register as a player",
    blurb: "I am registering myself individually",
    icon: "🏒",
    iconBg: "bg-emerald-500/15"
  },
  {
    value: "free_agent",
    title: "Free agent",
    blurb: "I want to play but don't have a team yet",
    icon: "👤",
    iconBg: "bg-amber-500/15"
  },
  {
    value: "captain_invite",
    title: "Captain invite",
    blurb: "I received an invite link from my captain",
    icon: "✉️",
    iconBg: "bg-violet-500/15"
  }
];

/**
 * Public, anonymous registration funnel.
 *
 * Entry-path → account → tier → custom questions (FormRenderer) → review.
 * Submission persists as a draft `registrations` row keyed by
 * (email, season, path); reopening the link with the same email resumes
 * the same draft. Account binding (Supabase user) lands when the visitor
 * comes back via magic-link in a follow-up wave.
 */
export function RegistrationFunnel({
  context,
  api
}: {
  context: PublicSeasonContext;
  /**
   * Bound public-registration API client. Each consuming app builds
   * its own via `createPublicRegistration(NEXT_PUBLIC_API_URL)` and
   * passes it in. This package never reads `process.env` directly.
   */
  api: PublicRegistrationApi;
}) {
  const [step, setStep] = useState<Step>("path");
  const [submissionType, setSubmissionType] = useState<SubmissionType | null>(
    null
  );
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [dobDate, setDobDate] = useState("");
  const [pricingTierId, setPricingTierId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  // Backend-determined post-submit state. Drives the Done screen UX.
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);
  // Phase 3 — waivers + parental consent + eligibility flags.
  const [waivers, setWaivers] = useState<WaiverDoc[] | null>(null);
  const [requiredKinds, setRequiredKinds] = useState<string[]>([]);
  const [signedVersionIds, setSignedVersionIds] = useState<Set<string>>(new Set());
  const [parentEmail, setParentEmail] = useState("");
  const [consentToken, setConsentToken] = useState("");
  const [consentMessage, setConsentMessage] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);
  const [eligibilityFlags, setEligibilityFlags] = useState<string[] | null>(null);

  const tiers = useMemo(
    () => context.pricingTiers.filter((t) => t.isActive),
    [context.pricingTiers]
  );
  const hasQuestions = (context.formDefinition?.questions ?? []).length > 0;

  // Per-season toggles set on the admin wizard's Divisions &
  // eligibility step. Defaults match @sportspulse/kernel
  // SEASON_CONFIG_DEFAULTS so unconfigured seasons keep the legacy
  // funnel behaviour.
  const seasonConfig = (context.season.config ?? {}) as {
    allowFreeAgent?: boolean;
    parentalConsentRequired?: boolean;
  };
  const allowFreeAgent = seasonConfig.allowFreeAgent ?? false;
  const parentalConsentRequired = seasonConfig.parentalConsentRequired ?? true;

  const stepOrder: Step[] = useMemo(() => {
    const out: Step[] = ["path", "account"];
    // Skip parental consent entirely when the admin disabled it for
    // this season, even if DOB indicates a minor — adult-only leagues
    // (or test seasons) often turn it off.
    if (isMinor && parentalConsentRequired) out.push("consent");
    if ((waivers?.length ?? 0) > 0) out.push("waivers");
    if (tiers.length > 0) out.push("tier");
    if (hasQuestions) out.push("questions");
    out.push("review", "payment", "done");
    return out;
  }, [isMinor, parentalConsentRequired, waivers, tiers.length, hasQuestions]);

  function next() {
    const i = stepOrder.indexOf(step);
    if (i < stepOrder.length - 1) setStep(stepOrder[i + 1]!);
  }
  function back() {
    const i = stepOrder.indexOf(step);
    if (i > 0) setStep(stepOrder[i - 1]!);
  }

  /**
   * Account-step submit: creates the auth user + submission row,
   * loads waivers for the org, kicks off the async eligibility check.
   * From here on every step has a real submissionId to act against.
   */
  async function submitAccount() {
    if (!submissionType || !email.trim() || password.length < 8 || !fullName.trim()) {
      setError("Email, full name, and password (8+ chars) are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.startSubmission(
        context.season.id,
        {
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          dobDate: dobDate || undefined,
          pricingTierId: pricingTierId ?? undefined,
          submissionType,
          answers
        }
      );
      setSubmissionId(result.id);
      setResumed(result.resumed);
      setSubmissionStatus(result.status);
      setIsMinor(result.isMinor);

      // Load Phase 3 waivers + run eligibility in parallel — neither
      // blocks advancing to the consent / waivers step. Eligibility
      // flags surface on the Review screen as warnings (spec §6.3).
      const [waiverResp] = await Promise.all([
        api.listWaivers(context.season.id).catch(() => null),
        api
          .runEligibilityCheck(result.id, email.trim())
          .then((r) => setEligibilityFlags(r.flags))
          .catch(() => undefined)
      ]);
      if (waiverResp) {
        setWaivers(waiverResp.documents);
        setRequiredKinds(waiverResp.requiredKinds);
      }

      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Review CTA — bounces to the payment step (mock Stripe).
   */
  async function continueToPayment() {
    next();
  }

  async function pay(outcome: "succeeded" | "failed" | "offline") {
    if (!submissionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.pay(submissionId, {
        email,
        mockOutcome: outcome
      });
      setSubmissionStatus(res.status);
      if (res.status === "pending_review" || res.status === "pending_offline") {
        setStep("done");
      } else if (res.declineReason) {
        setError(res.declineReason);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const activePhase = phaseFor(step);
  const phaseHeading = phaseHeadingFor(step);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PhaseStepper activePhase={activePhase} />

      <header className="mt-8 space-y-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">
          {phaseHeading.title}
        </h1>
        <p className="text-[12px] text-fg-muted">
          {phaseHeading.subtitle ??
            `${context.season.name}${
              context.season.registrationClosesAt
                ? ` · Registration closes ${fmtDate(context.season.registrationClosesAt)}`
                : ""
            }`}
        </p>
      </header>

      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-6">
        {step === "path" && (
          <PathStep
            value={submissionType}
            onChange={setSubmissionType}
            onNext={next}
            allowFreeAgent={allowFreeAgent}
          />
        )}

        {step === "account" && (
          <AccountStep
            email={email}
            fullName={fullName}
            password={password}
            phone={phone}
            dobDate={dobDate}
            submitting={submitting}
            error={error}
            onEmailChange={setEmail}
            onFullNameChange={setFullName}
            onPasswordChange={setPassword}
            onPhoneChange={setPhone}
            onDobChange={setDobDate}
            onBack={back}
            onSubmit={submitAccount}
          />
        )}

        {step === "consent" && (
          <ConsentStep
            submissionId={submissionId!}
            email={email}
            parentEmail={parentEmail}
            consentToken={consentToken}
            consentMessage={consentMessage}
            onParentEmailChange={setParentEmail}
            onConsentTokenChange={setConsentToken}
            onSendConsent={async () => {
              setSubmitting(true);
              try {
                const res = await api.startParentalConsent(
                  submissionId!,
                  { email, parentEmail }
                );
                setConsentToken(res.consentToken);
                setConsentMessage(res.mockConsentMessage);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            onConfirm={async () => {
              setSubmitting(true);
              try {
                const res = await api.confirmParentalConsent(
                  submissionId!,
                  { email, consentToken }
                );
                setSubmissionStatus(res.status);
                next();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            onBack={back}
            submitting={submitting}
            error={error}
          />
        )}

        {step === "waivers" && waivers && (
          <WaiversStep
            documents={waivers}
            requiredKinds={requiredKinds}
            signedVersionIds={signedVersionIds}
            fullName={fullName}
            onSign={async (versionId, signatureName) => {
              try {
                const res = await api.signWaiver(
                  submissionId!,
                  {
                    email,
                    documentVersionId: versionId,
                    signatureName
                  }
                );
                setSignedVersionIds(
                  (prev) => new Set([...prev, versionId])
                );
                if (res.outstandingRequired === 0) {
                  // Don't auto-advance — let the player click Continue
                  // so they see the all-signed confirmation.
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            onBack={back}
            onNext={next}
          />
        )}

        {step === "tier" && (
          <TierStep
            tiers={tiers}
            value={pricingTierId}
            onChange={setPricingTierId}
            onBack={back}
            onNext={next}
          />
        )}

        {step === "questions" && (
          <QuestionsStep
            definition={context.formDefinition}
            initialAnswers={answers}
            onChange={setAnswers}
            onBack={back}
            onNext={next}
          />
        )}

        {step === "review" && (
          <ReviewStep
            season={context.season}
            submissionType={submissionType!}
            email={email}
            fullName={fullName}
            tier={tiers.find((t) => t.id === pricingTierId) ?? null}
            eligibilityFlags={eligibilityFlags}
            error={error}
            submitting={submitting}
            onBack={back}
            onSubmit={continueToPayment}
          />
        )}

        {step === "payment" && (
          <PaymentStep
            tier={tiers.find((t) => t.id === pricingTierId) ?? null}
            submitting={submitting}
            error={error}
            onPay={() => pay("succeeded")}
            onSimulateDecline={() => pay("failed")}
            onPayOffline={() => pay("offline")}
            onBack={back}
          />
        )}

        {step === "done" && (
          <DoneStep
            email={email}
            submissionId={submissionId!}
            resumed={resumed}
            status={submissionStatus}
            isMinor={isMinor}
            context={context}
            submissionType={submissionType}
          />
        )}
      </div>

      <p className="mt-6 text-center text-[11px] text-fg-muted">
        Your data is held against this season only. The Account step in a
        follow-up email will link this submission to your sign-in.
      </p>
    </div>
  );
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return s;
  }
}

/**
 * 6-phase stepper that maps the engine's 9 internal states onto the
 * mockup's coarser phases:
 *
 *   1 Path         ← path
 *   2 Account      ← account
 *   3 Details      ← tier + questions
 *   4 Compliance   ← consent + waivers
 *   5 Payment      ← review + payment
 *   ⋯ Confirmation ← done
 *
 * Numbered circles + label-below layout, with a connector line that
 * turns green when crossed (matches the mockup chrome).
 */
type Phase = 1 | 2 | 3 | 4 | 5 | 6;

const PHASE_LABELS: Record<Phase, string> = {
  1: "Path",
  2: "Account",
  3: "Details",
  4: "Compliance",
  5: "Payment",
  6: "Confirmation"
};

function phaseFor(step: Step): Phase {
  switch (step) {
    case "path":
      return 1;
    case "account":
      return 2;
    case "tier":
    case "questions":
      return 3;
    case "consent":
    case "waivers":
      return 4;
    case "review":
    case "payment":
      return 5;
    case "done":
      return 6;
  }
}

function PhaseStepper({ activePhase }: { activePhase: Phase }) {
  const phases: Phase[] = [1, 2, 3, 4, 5, 6];
  return (
    <ol className="flex w-full items-center gap-2 sm:gap-3">
      {phases.map((p, i) => {
        const isActive = p === activePhase;
        const isDone = p < activePhase;
        const isFuture = p > activePhase;
        const isLast = p === 6;
        return (
          <li key={p} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={
                  isActive
                    ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent bg-accent font-mono text-[12px] font-medium text-bg"
                    : isDone
                      ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500 text-white"
                      : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-bg-subtle font-mono text-[12px] font-medium text-fg-muted"
                }
              >
                {isDone ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : isLast ? (
                  <span aria-hidden>⋯</span>
                ) : (
                  <span className="tabular-nums">{p}</span>
                )}
              </span>
              <span
                className={
                  isActive
                    ? "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-fg sm:inline"
                    : isDone
                      ? "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 sm:inline"
                      : "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-fg-muted sm:inline"
                }
              >
                {PHASE_LABELS[p]}
              </span>
            </div>
            {i < phases.length - 1 ? (
              <div className="h-px flex-1 self-start mt-4 bg-border">
                <div
                  className={
                    p < activePhase
                      ? "h-full bg-emerald-500"
                      : "h-full bg-transparent"
                  }
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function PathStep({
  value,
  onChange,
  onNext,
  allowFreeAgent
}: {
  value: SubmissionType | null;
  onChange: (v: SubmissionType) => void;
  onNext: () => void;
  /** Hide the free-agent card when the season has it disabled. */
  allowFreeAgent: boolean;
}) {
  const visiblePaths = PATHS.filter(
    (p) => p.value !== "free_agent" || allowFreeAgent
  );
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <h2 className="text-[14px] font-semibold tracking-tight text-fg">
          How are you registering?
        </h2>
        <p className="mt-0.5 text-[12px] text-fg-muted">
          Choose the path that applies to you
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visiblePaths.map((p) => {
            const on = value === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange(p.value)}
                className={
                  on
                    ? "flex items-start gap-3 rounded-lg border border-accent bg-accent/5 p-4 text-left ring-2 ring-accent/30 transition-colors"
                    : "flex items-start gap-3 rounded-lg border border-border bg-bg-subtle p-4 text-left transition-colors hover:border-fg-muted"
                }
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[18px] ${p.iconBg}`}
                  aria-hidden
                >
                  {p.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-fg">
                    {p.title}
                  </span>
                  <span className="mt-1 block text-[12px] text-fg-muted">
                    {p.blurb}
                  </span>
                </span>
                {on ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-accent"
                    strokeWidth={2.25}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!value}>
          Next: Account <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AccountStep({
  email,
  fullName,
  password,
  phone,
  dobDate,
  submitting,
  error,
  onEmailChange,
  onFullNameChange,
  onPasswordChange,
  onPhoneChange,
  onDobChange,
  onBack,
  onSubmit
}: {
  email: string;
  fullName: string;
  password: string;
  phone: string;
  dobDate: string;
  submitting: boolean;
  error: string | null;
  onEmailChange: (v: string) => void;
  onFullNameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onDobChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const emailOk = /.+@.+\..+/.test(email.trim());
  const nameOk = fullName.trim().length > 0;
  const pwOk = password.length >= 8;
  const valid = emailOk && nameOk && pwOk;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Create your account</h2>
        <p className="mt-1 text-sm text-fg-muted">
          We'll use these credentials whenever you come back. Email is the
          resume key — reopening this link with the same address picks up
          your draft. DOB drives the parental-consent flow for minors.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="captain@example.com"
            required
          />
        </Field>
        <Field label="Full name">
          <Input
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            placeholder="Sasha Velasquez"
          />
        </Field>
        <Field
          label="Password"
          hint="Minimum 8 characters. You'll use this to come back later."
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Phone (optional)">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="+1 555 555 0123"
          />
        </Field>
        <Field
          label="Date of birth"
          hint="Under 18 triggers the parental consent step."
        >
          <Input
            type="date"
            value={dobDate}
            onChange={(e) => onDobChange(e.target.value)}
          />
        </Field>
      </div>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={!valid || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…
            </>
          ) : (
            <>
              Create account <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ConsentStep({
  submissionId,
  email,
  parentEmail,
  consentToken,
  consentMessage,
  onParentEmailChange,
  onConsentTokenChange,
  onSendConsent,
  onConfirm,
  onBack,
  submitting,
  error
}: {
  submissionId: string;
  email: string;
  parentEmail: string;
  consentToken: string;
  consentMessage: { to: string; subject: string; body: string } | null;
  onParentEmailChange: (v: string) => void;
  onConsentTokenChange: (v: string) => void;
  onSendConsent: () => void;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const validParent = /.+@.+\..+/.test(parentEmail.trim());
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Parental consent required</h2>
        <p className="mt-1 text-sm text-fg-muted">
          You're under 18, so we need a parent or guardian to confirm before
          payment can proceed (Workflow 1 §6.2). We'll send them a consent
          link — for the mock flow you'll see the message inline so it can
          be relayed manually.
        </p>
      </div>

      <Field label="Parent / guardian email">
        <Input
          type="email"
          value={parentEmail}
          onChange={(e) => onParentEmailChange(e.target.value)}
          placeholder="parent@example.com"
        />
      </Field>

      <Button
        type="button"
        variant="secondary"
        disabled={!validParent || submitting}
        onClick={onSendConsent}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>Send consent request</>
        )}
      </Button>

      {consentMessage && (
        <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // Mock consent message · {consentMessage.to}
          </p>
          <p className="text-[12px] font-medium text-fg">
            Subject: {consentMessage.subject}
          </p>
          <textarea
            readOnly
            value={consentMessage.body}
            rows={Math.min(10, consentMessage.body.split("\n").length + 1)}
            className="w-full resize-y rounded-md border border-border bg-surface-1 p-2 font-mono text-[11px] leading-relaxed text-fg"
          />
          <p className="text-[11px] text-fg-muted">
            Until Resend is wired, paste the consent token below from the
            message above.
          </p>
        </div>
      )}

      <Field
        label="Consent token"
        hint="From the email/in-app prompt your parent received."
      >
        <Input
          value={consentToken}
          onChange={(e) => onConsentTokenChange(e.target.value)}
          placeholder="Paste consent token…"
        />
      </Field>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!consentToken.trim() || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming…
            </>
          ) : (
            <>Confirm consent <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

function WaiversStep({
  documents,
  requiredKinds,
  signedVersionIds,
  fullName,
  onSign,
  onBack,
  onNext
}: {
  documents: WaiverDoc[];
  requiredKinds: string[];
  signedVersionIds: Set<string>;
  fullName: string;
  onSign: (versionId: string, signatureName: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const requiredOutstanding = documents.filter(
    (d) => requiredKinds.includes(d.kind) && !signedVersionIds.has(d.versionId)
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Sign your waivers</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Required ({requiredKinds.join(", ")}) waivers must be signed
          before you can pay (Workflow 1 §6.1). Optional documents you can
          skip — they're recorded as declined.
        </p>
      </div>

      <ul className="space-y-3">
        {documents.map((d) => (
          <WaiverCard
            key={d.documentId}
            doc={d}
            isRequired={requiredKinds.includes(d.kind)}
            isSigned={signedVersionIds.has(d.versionId)}
            fullName={fullName}
            onSign={(name) => onSign(d.versionId, name)}
          />
        ))}
      </ul>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={requiredOutstanding.length > 0}>
          {requiredOutstanding.length > 0
            ? `Sign ${requiredOutstanding.length} more required`
            : "Continue"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function WaiverCard({
  doc,
  isRequired,
  isSigned,
  fullName,
  onSign
}: {
  doc: WaiverDoc;
  isRequired: boolean;
  isSigned: boolean;
  fullName: string;
  onSign: (signatureName: string) => Promise<void>;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [typed, setTyped] = useState("");
  const [signing, setSigning] = useState(false);
  const namesMatch =
    typed.trim().toLowerCase() === fullName.trim().toLowerCase();
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolled(true);
  }
  return (
    <li className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-fg">{doc.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {doc.kind} {isRequired && "· required"}
          </p>
        </div>
        {isSigned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3" strokeWidth={2.25} /> Signed
          </span>
        )}
      </div>
      {!isSigned && (
        <>
          <div
            onScroll={onScroll}
            className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border bg-bg-subtle p-3 text-[12px] leading-relaxed text-fg"
            dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field
              label="Type your full legal name to sign"
              hint={
                scrolled
                  ? namesMatch
                    ? "Looks good."
                    : "Must match your account name exactly."
                  : "Scroll to the end of the document first."
              }
            >
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={!scrolled}
                placeholder={fullName}
              />
            </Field>
            <Button
              type="button"
              disabled={!scrolled || !namesMatch || signing}
              onClick={async () => {
                setSigning(true);
                try {
                  await onSign(typed.trim());
                } finally {
                  setSigning(false);
                }
              }}
            >
              {signing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sign"
              )}
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function TierStep({
  tiers,
  value,
  onChange,
  onBack,
  onNext
}: {
  tiers: PricingTier[];
  value: string | null;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Pick a pricing tier</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Choose the tier that matches your situation. Payment plans available
          on tiers that show one.
        </p>
      </div>

      <div className="grid gap-3">
        {tiers.map((t) => {
          const on = value === t.id;
          const free = t.isFree || t.fullPriceCents === 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={
                on
                  ? "flex items-start justify-between gap-4 rounded-lg border border-accent bg-accent/5 p-4 text-left ring-2 ring-accent/30"
                  : "flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left hover:border-fg-muted"
              }
            >
              <div className="space-y-1">
                <p className="text-[13px] font-semibold text-fg">{t.name}</p>
                {t.description && (
                  <p className="text-[12px] leading-relaxed text-fg-muted">
                    {t.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {t.paymentPlanEnabled && (
                    <Chip>Payment plan · {t.installmentCount}x</Chip>
                  )}
                  {t.isReturningTeamPricing && <Chip>Returning teams</Chip>}
                  {t.usageLimit && (
                    <Chip>
                      {t.usageCount}/{t.usageLimit} taken
                    </Chip>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-[16px] font-semibold tabular-nums text-fg">
                  {free
                    ? "Free"
                    : `${(t.fullPriceCents / 100).toFixed(2)} ${t.currency}`}
                </p>
                {on && (
                  <Check
                    className="ml-auto mt-1 h-4 w-4 text-accent"
                    strokeWidth={2.25}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!value}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QuestionsStep({
  definition,
  initialAnswers,
  onChange,
  onBack,
  onNext
}: {
  definition: PublicSeasonContext["formDefinition"];
  initialAnswers: AnswerMap;
  onChange: (next: AnswerMap) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">A few quick questions</h2>
        <p className="mt-1 text-sm text-fg-muted">
          The league set these — answers are saved against the question key,
          so they stick even if labels are reworded later.
        </p>
      </div>

      <FormRenderer
        definition={definition}
        initialAnswers={initialAnswers}
        onChange={onChange}
      />

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  season,
  submissionType,
  email,
  fullName,
  tier,
  eligibilityFlags,
  error,
  submitting,
  onBack,
  onSubmit
}: {
  season: PublicSeasonContext["season"];
  submissionType: SubmissionType;
  email: string;
  fullName: string;
  tier: PricingTier | null;
  eligibilityFlags: string[] | null;
  error: string | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Review &amp; submit</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Last look. We'll create a draft against this season and email you
          the next step.
        </p>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border bg-surface-1 text-sm">
        <Row label="Season">{season.name}</Row>
        <Row label="Path">{labelForPath(submissionType)}</Row>
        <Row label="Email">{email}</Row>
        {fullName && <Row label="Name">{fullName}</Row>}
        {tier && (
          <Row label="Tier">
            {tier.name}
            {!tier.isFree && (
              <span className="ml-2 font-mono text-[12px] text-fg-muted">
                {(tier.fullPriceCents / 100).toFixed(2)} {tier.currency}
              </span>
            )}
          </Row>
        )}
      </dl>

      {eligibilityFlags && eligibilityFlags.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          <p className="font-medium">Eligibility flags raised:</p>
          <ul className="ml-4 list-disc">
            {eligibilityFlags.map((f) => (
              <li key={f} className="font-mono">
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Per spec §6.3 these don't block payment — admin will review
            asynchronously and may request resubmission.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Continuing…
            </>
          ) : (
            <>Continue to payment</>
          )}
        </Button>
      </div>
    </div>
  );
}

function PaymentStep({
  tier,
  submitting,
  error,
  onPay,
  onSimulateDecline,
  onPayOffline,
  onBack
}: {
  tier: PricingTier | null;
  submitting: boolean;
  error: string | null;
  onPay: () => void;
  onSimulateDecline: () => void;
  onPayOffline: () => void;
  onBack: () => void;
}) {
  const amount = tier
    ? `${(tier.fullPriceCents / 100).toFixed(2)} ${tier.currency}`
    : "0.00 USD";
  const free = !tier || tier.isFree || tier.fullPriceCents === 0;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Payment (mock)</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Stripe integration is mocked while we wire it up. Pick an outcome
          to drive the state machine: <span className="font-mono">succeeded</span>{" "}
          → invoice paid + admin review, <span className="font-mono">failed</span>{" "}
          → stays in pending_payment, <span className="font-mono">offline</span>{" "}
          → admin marks paid manually.
        </p>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border bg-surface-1 text-sm">
        <Row label="Tier">{tier?.name ?? "No tier selected"}</Row>
        <Row label="Total due">
          {free ? (
            <span className="font-mono text-fg">Free</span>
          ) : (
            <span className="font-mono text-fg">{amount}</span>
          )}
        </Row>
        {tier?.paymentPlanEnabled && (
          <Row label="Payment plan">
            <span className="font-mono text-[12px] text-fg-muted">
              {tier.installmentCount}× installments — full-pay only in mock
            </span>
          </Row>
        )}
      </dl>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button onClick={onPay} disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>Pay {free ? "(free)" : amount}</>
          )}
        </Button>
        <Button variant="secondary" onClick={onPayOffline} disabled={submitting}>
          Pay offline
        </Button>
        <Button
          variant="ghost"
          onClick={onSimulateDecline}
          disabled={submitting}
        >
          Simulate decline
        </Button>
      </div>

      <div className="flex justify-start">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
      <dd className="text-right text-[13px] text-fg">{children}</dd>
    </div>
  );
}

function DoneStep({
  email,
  submissionId,
  resumed,
  status,
  isMinor,
  context,
  submissionType
}: {
  email: string;
  submissionId: string;
  resumed: boolean;
  status: string | null;
  isMinor: boolean;
  context: PublicSeasonContext;
  submissionType: SubmissionType | null;
}) {
  const guidance = guidanceFor(status, isMinor);
  // Build a humane reference number — e.g. "PPHL-2025-NH-08841" from
  // the season's initials + year + a slice of the submission id.
  const seasonAbbrev = context.season.name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("")
    .slice(0, 4);
  const yearPart = (context.season.startDate ?? "").slice(0, 4);
  const refNumber = `${seasonAbbrev || "REG"}-${yearPart}-${submissionId.slice(0, 8).toUpperCase()}`;

  // Split-pay link for team captains — shareable URL their roster
  // members hit to pay their own share. Empty for non-team paths.
  const splitPayLink =
    submissionType === "team"
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/registration/${context.season.id}/player?team=${submissionId.slice(0, 8)}`
      : null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex flex-col items-center gap-3 border-b border-border pb-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="h-7 w-7" strokeWidth={2.25} />
          </div>
          <p className="text-[18px] font-semibold tracking-tight text-fg">
            {guidance.headline(resumed)}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {guidance.body}
          </p>
          <div className="rounded-md border border-border bg-bg-subtle px-4 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Reference number
            </p>
            <p className="font-mono text-[14px] tabular-nums text-fg">
              {refNumber}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[12px] text-fg-muted">
          A confirmation email has been sent to <span className="text-fg">{email}</span>{" "}
          with your receipt and next steps.
        </p>

        <dl className="mt-4 space-y-2">
          <DetailRow label="Season" value={context.season.name} />
          {submissionType ? (
            <DetailRow label="Path" value={labelForPath(submissionType)} />
          ) : null}
          {status ? (
            <DetailRow label="Status" value={status.replace(/_/g, " ")} />
          ) : null}
        </dl>
      </section>

      {splitPayLink ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Share player invite link
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Split pay enabled
            </span>
          </div>
          <p className="mt-1 text-[12px] text-fg-muted">
            Send this link to your players. Each player completes their own
            payment share independently.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-bg-subtle px-3 py-2 font-mono text-[11px] text-blue-600 dark:text-blue-300">
              {splitPayLink}
            </code>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(splitPayLink).catch(() => undefined);
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              Copy
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          What happens next?
        </p>
        <ol className="mt-3 space-y-2.5">
          <NextStep
            n={1}
            title="Admin eligibility review"
            body="League admin reviews your documents. You will be notified within 2 business days."
          />
          <NextStep
            n={2}
            title="Approval confirmation"
            body="Once approved, you'll appear on the team roster and schedule."
          />
          <NextStep
            n={3}
            title={`Season begins ${fmtDate(context.season.startDate)}`}
            body="Your schedule and game notifications will be active."
          />
        </ol>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className="font-mono text-[12px] tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function NextStep({
  n,
  title,
  body
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-subtle font-mono text-[11px] tabular-nums text-fg-muted">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted">{body}</p>
      </div>
    </li>
  );
}

function guidanceFor(
  status: string | null,
  isMinor: boolean
): { headline: (resumed: boolean) => string; body: string } {
  switch (status) {
    case "pending_consent":
      return {
        headline: (r) => (r ? "Welcome back" : "Almost there"),
        body: isMinor
          ? "We've flagged you as under 18. Next step: parental consent — we'll send a link to your parent / guardian. (Email delivery wires up next pass; for now look for the in-app prompt.)"
          : "We need parental consent before payment can proceed."
      };
    case "pending_payment":
      return {
        headline: (r) => (r ? "Welcome back" : "Account created"),
        body: "Next: pay the registration fee. Payment opens in the next slice (mock Stripe)."
      };
    case "pending_review":
      return {
        headline: () => "Payment received",
        body: "Your submission is now in admin review. You'll hear back via email."
      };
    case "approved":
      return {
        headline: () => "You're on the roster!",
        body: "Welcome aboard. Your team / free-agent placement is live."
      };
    case "rejected":
      return {
        headline: () => "Submission not approved",
        body: "Admin couldn't approve this submission. A refund is in flight per league policy."
      };
    case "cancelled":
      return {
        headline: () => "Cancelled",
        body: "This submission was cancelled. You can start fresh any time."
      };
    default:
      return {
        headline: (r) => (r ? "Welcome back" : "You're in"),
        body: "We've started a draft registration against this season."
      };
  }
}

function labelForPath(t: SubmissionType): string {
  return PATHS.find((p) => p.value === t)?.title ?? t;
}

/**
 * Per-step header (mockup's two-line block under the stepper).
 * The subtitle is null when the funnel should fall back to the
 * default "<season> · Registration closes <date>" line.
 */
function phaseHeadingFor(step: Step): {
  title: string;
  subtitle: string | null;
} {
  switch (step) {
    case "path":
      return {
        title: "Player registration",
        subtitle: null
      };
    case "account":
      return {
        title: "Create your account",
        subtitle: "Phase 1 — Account creation & authentication"
      };
    case "tier":
    case "questions":
      return {
        title: "Your details",
        subtitle: "Phase 2 — Player & team information"
      };
    case "consent":
    case "waivers":
      return {
        title: "Compliance & waivers",
        subtitle: "Phase 3 — Documents, eligibility checks, and digital signatures"
      };
    case "review":
    case "payment":
      return {
        title: "Payment",
        subtitle: "Phase 4 — Invoice & payment selection"
      };
    case "done":
      return {
        title: "Registration submitted",
        subtitle: "Phase 6 — Confirmation & activation"
      };
  }
}
