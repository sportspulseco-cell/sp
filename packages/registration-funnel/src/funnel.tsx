"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { AnswerMap, FormWaiversConfig } from "@sportspulse/kernel";
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /** Composed from firstName + lastName at submit time. Kept in
   * state so legacy callers (single-line "Sasha Velasquez" inputs
   * in older entry points) still work. */
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const setFullName = (v: string) => {
    const parts = v.trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
  };
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [dobDate, setDobDate] = useState("");
  const [pricingTierId, setPricingTierId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Phase 2 team-info card state (only shown when path=team).
  // Sent to the backend via the answers map under reserved keys at
  // payment time — future iteration moves this to a dedicated table.
  const [teamName, setTeamName] = useState("");
  const [teamDivision, setTeamDivision] = useState("");
  const [teamColor, setTeamColor] = useState("#3B82F6");
  // Phase 3 compliance toggles (mockup cards: code of conduct,
  // photo / media release). Stored on the answers map under reserved
  // keys at submit time.
  const [codeOfConductAccepted, setCodeOfConductAccepted] = useState(false);
  const [photoReleaseAccepted, setPhotoReleaseAccepted] = useState(false);
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
    requireLiabilityWaiver?: boolean;
    requireCodeOfConduct?: boolean;
    liabilityWaiverContent?: string;
    codeOfConductContent?: string;
  };
  const allowFreeAgent = seasonConfig.allowFreeAgent ?? false;
  const parentalConsentRequired = seasonConfig.parentalConsentRequired ?? true;

  // Per repo owner directive (2026-05-09), season.config is the
  // canonical source for waiver toggles + body text — admins manage
  // them on the Divisions & eligibility step. The form's
  // `formDefinition.waivers` is kept as a secondary fallback for
  // older drafts that pre-date the season.config columns.
  const formWaivers: FormWaiversConfig | null = useMemo(() => {
    const requireLiability = seasonConfig.requireLiabilityWaiver ?? null;
    const requireCoC = seasonConfig.requireCodeOfConduct ?? null;
    const liabilityBody = seasonConfig.liabilityWaiverContent ?? "";
    const cocBody = seasonConfig.codeOfConductContent ?? "";
    const seasonHasWaiverConfig =
      requireLiability !== null ||
      requireCoC !== null ||
      liabilityBody.length > 0 ||
      cocBody.length > 0;
    if (seasonHasWaiverConfig) {
      return {
        liabilityWaiver: {
          enabled: requireLiability ?? true,
          content: liabilityBody
        },
        codeOfConduct: {
          enabled: requireCoC ?? true,
          content: cocBody
        },
        // Photo release isn't in season.config yet — fall through to
        // form.waivers if present, else default off.
        photoRelease:
          context.formDefinition?.waivers?.photoRelease ?? {
            enabled: false,
            content: ""
          }
      };
    }
    return context.formDefinition?.waivers ?? null;
  }, [
    seasonConfig.requireLiabilityWaiver,
    seasonConfig.requireCodeOfConduct,
    seasonConfig.liabilityWaiverContent,
    seasonConfig.codeOfConductContent,
    context.formDefinition?.waivers
  ]);
  const hasInlineWaivers =
    !!formWaivers &&
    (formWaivers.liabilityWaiver.enabled ||
      formWaivers.codeOfConduct.enabled ||
      formWaivers.photoRelease.enabled);

  const stepOrder: Step[] = useMemo(() => {
    // Order must match the PhaseStepper labels (1 Path · 2 Account ·
    // 3 Details · 4 Compliance · 5 Payment · 6 Confirmation). The
    // inner `questions` step IS the Details phase, so it must run
    // before consent / waivers (Compliance) and before tier / review
    // / payment (Payment). Earlier versions had questions after tier,
    // which made the stepper jump 4 → 5 → 3.
    const out: Step[] = ["path", "account"];
    if (hasQuestions) out.push("questions");
    // Skip parental consent entirely when the admin disabled it for
    // this season, even if DOB indicates a minor — adult-only leagues
    // (or test seasons) often turn it off.
    if (isMinor && parentalConsentRequired) out.push("consent");
    if (hasInlineWaivers || (waivers?.length ?? 0) > 0) out.push("waivers");
    if (tiers.length > 0) out.push("tier");
    out.push("review", "payment", "done");
    return out;
  }, [
    isMinor,
    parentalConsentRequired,
    waivers,
    tiers.length,
    hasQuestions,
    hasInlineWaivers
  ]);

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
   * Sign-in path for the AccountStep "Already have an account?" card.
   * Calls the resume endpoint, which validates the email exists and
   * pulls the user's stored displayName so we don't have to re-collect
   * first / last name.
   *
   * NOTE: this demo flow does not currently password-verify (the
   * service-role admin client can't `signInWithPassword`). Production
   * needs an anon-key client for true credential validation. See
   * doc/deferred-integrations.md.
   */
  async function submitSignIn() {
    if (!email.trim()) {
      setError("Enter the email you used to sign up.");
      return;
    }
    if (!submissionType) {
      setError("Pick a registration path before signing in.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.resumeSubmission(context.season.id, {
        email: email.trim(),
        submissionType
      });
      setSubmissionId(result.id);
      setResumed(result.resumed);
      setSubmissionStatus(result.status);
      setIsMinor(result.isMinor);
      setFullName(result.fullName);

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
            firstName={firstName}
            lastName={lastName}
            password={password}
            confirmPassword={confirmPassword}
            phone={phone}
            submitting={submitting}
            error={error}
            onEmailChange={setEmail}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onPhoneChange={setPhone}
            onBack={back}
            onSubmit={submitAccount}
            onSignIn={submitSignIn}
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

        {step === "waivers" && (
          <WaiversStep
            documents={waivers ?? []}
            requiredKinds={requiredKinds}
            signedVersionIds={signedVersionIds}
            fullName={fullName}
            eligibilityFlags={eligibilityFlags}
            formWaivers={formWaivers}
            codeOfConductAccepted={codeOfConductAccepted}
            photoReleaseAccepted={photoReleaseAccepted}
            onCodeOfConductChange={setCodeOfConductAccepted}
            onPhotoReleaseChange={setPhotoReleaseAccepted}
            onSign={async (versionId, signatureName) => {
              // Inline (form-defined) waivers carry a synthetic id —
              // no backend round-trip; just track sign locally so the
              // funnel can advance.
              if (versionId.startsWith("form:")) {
                setSignedVersionIds(
                  (prev) => new Set([...prev, versionId])
                );
                return;
              }
              try {
                const res = await api.signWaiver(submissionId!, {
                  email,
                  documentVersionId: versionId,
                  signatureName
                });
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
            submissionType={submissionType}
            teamName={teamName}
            teamDivision={teamDivision}
            teamColor={teamColor}
            onTeamNameChange={setTeamName}
            onTeamDivisionChange={setTeamDivision}
            onTeamColorChange={setTeamColor}
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
  // Mockup mapping: 1 Path · 2 Account · 3 Details · 4 Compliance ·
  // 5 Payment · 6 Confirmation. tier picker lives inside Payment in
  // the mockup (the invoice + payment-option card composes both); we
  // keep tier as a separate inner state for back-compat but pin it to
  // Phase 5 in the stepper.
  switch (step) {
    case "path":
      return 1;
    case "account":
      return 2;
    case "questions":
      return 3;
    case "consent":
    case "waivers":
      return 4;
    case "tier":
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

/**
 * Mockup-aligned Phase 1 chrome — sign-in primary, create-account
 * secondary. The default tab is **Sign in** since most repeat traffic
 * is returning players resuming a draft. Tab toggle at the top swaps
 * between the two flows; only one form is visible at a time so admins
 * never misfile credentials in the wrong section.
 *
 * DOB is captured on Phase 2 (Details) per the mockup, so the parental-
 * consent decision is deferred until the eligibility re-check at the
 * end of Phase 2.
 */
function AccountStep({
  email,
  firstName,
  lastName,
  password,
  confirmPassword,
  phone,
  submitting,
  error,
  onEmailChange,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onPhoneChange,
  onBack,
  onSubmit,
  onSignIn
}: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  phone: string;
  submitting: boolean;
  error: string | null;
  onEmailChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onSignIn: () => void;
}) {
  const [mode, setMode] = useState<"sign_in" | "create">("sign_in");
  // Independent state for the sign-in tab so it doesn't entangle with
  // the create-account inputs (filling sign-in email shouldn't pre-fill
  // the create form, and vice versa).
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  const emailOk = /.+@.+\..+/.test(email.trim());
  const nameOk = firstName.trim().length > 0 && lastName.trim().length > 0;
  const pwOk = password.length >= 8;
  const pwMatches = password === confirmPassword;
  const valid = emailOk && nameOk && pwOk && pwMatches;
  const signInEmailOk = /.+@.+\..+/.test(signInEmail.trim());

  return (
    <div className="space-y-5">
      {/* Tab toggle — sign-in is the default tab since most visitors
          land here from a saved link to resume their draft. */}
      <div
        role="tablist"
        aria-label="Account mode"
        className="inline-flex rounded-lg border border-border bg-bg-subtle p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign_in"}
          onClick={() => setMode("sign_in")}
          className={
            mode === "sign_in"
              ? "rounded-md bg-surface-1 px-4 py-1.5 text-[13px] font-medium text-fg shadow-sm"
              : "rounded-md px-4 py-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
          }
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          onClick={() => setMode("create")}
          className={
            mode === "create"
              ? "rounded-md bg-surface-1 px-4 py-1.5 text-[13px] font-medium text-fg shadow-sm"
              : "rounded-md px-4 py-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
          }
        >
          Create account
        </button>
      </div>

      {mode === "sign_in" ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Sign in to continue
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Use the same email you used last time. Your profile and any
            draft from this season load automatically.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Email *">
              <Input
                type="email"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password *">
              <Input
                type="password"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              New to SportsPulse? Create an account →
            </button>
            <Button
              type="button"
              disabled={!signInEmailOk || submitting}
              onClick={() => {
                // Hand the email up to the parent so the resume call uses it.
                onEmailChange(signInEmail.trim());
                onSignIn();
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in & continue <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Create your account
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            We'll use these details for league communications and roster
            entries.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="First name *">
              <Input
                value={firstName}
                onChange={(e) => onFirstNameChange(e.target.value)}
                placeholder="Johnny"
                required
              />
            </Field>
            <Field label="Last name *">
              <Input
                value={lastName}
                onChange={(e) => onLastNameChange(e.target.value)}
                placeholder="Kula"
                required
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4">
            <Field label="Email address *">
              <Input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="johnny@pphl.com"
                required
              />
            </Field>
            <Field label="Phone number" hint="Optional — used for SMS reminders">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="+1 (617) 555-0100"
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Password *">
              <Input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Min 8 chars"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm password *">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => onConfirmPasswordChange(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
                required
              />
            </Field>
          </div>
          <p className="mt-4 text-[12px] text-fg-muted">
            A verification email will be sent. Your registration session is
            preserved — you can verify in another tab and return here.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode("sign_in")}
              className="text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              ← Already have an account? Sign in
            </button>
            <Button onClick={onSubmit} disabled={!valid || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating
                  account…
                </>
              ) : (
                <>
                  Next: Details <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </section>
      )}

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {mode === "create" && !pwMatches && confirmPassword.length > 0 ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          Passwords don't match.
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={submitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={!valid || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating
              account…
            </>
          ) : (
            <>
              Next: Details <ArrowRight className="ml-2 h-4 w-4" />
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

/**
 * Phase 3 (Compliance & waivers). Mockup-aligned 4-card layout:
 *   1. Automated eligibility checks — hardcoded 5-row panel where each
 *      row's status is derived from `eligibilityFlags` (failed flag →
 *      amber `!`, otherwise green ✓).
 *   2. Liability waiver — sign-in-name signature collected per-doc.
 *   3. Code of conduct — single required toggle.
 *   4. Photo / media release — optional toggle.
 *
 * Continue is gated on: all required waivers signed AND code of conduct
 * accepted. Photo release is optional.
 */
function WaiversStep({
  documents,
  requiredKinds,
  signedVersionIds,
  fullName,
  eligibilityFlags,
  formWaivers,
  codeOfConductAccepted,
  photoReleaseAccepted,
  onCodeOfConductChange,
  onPhotoReleaseChange,
  onSign,
  onBack,
  onNext
}: {
  documents: WaiverDoc[];
  requiredKinds: string[];
  signedVersionIds: Set<string>;
  fullName: string;
  eligibilityFlags: string[] | null;
  formWaivers: FormWaiversConfig | null;
  codeOfConductAccepted: boolean;
  photoReleaseAccepted: boolean;
  onCodeOfConductChange: (v: boolean) => void;
  onPhotoReleaseChange: (v: boolean) => void;
  onSign: (versionId: string, signatureName: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  // Synthesise a WaiverDoc for the form-configured liability waiver
  // when enabled. Synthetic versionId carries the `form:` prefix so
  // the parent's onSign handler skips the backend round-trip.
  const inlineLiability: WaiverDoc | null =
    formWaivers?.liabilityWaiver.enabled
      ? {
          documentId: "form:liability",
          versionId: "form:liability:v1",
          kind: "waiver",
          name: "Liability waiver",
          description: null,
          contentHtml: formWaivers.liabilityWaiver.content,
          languageCode: "en"
        }
      : null;

  // When inline waivers are configured, ignore the org-documents list
  // entirely — the form is the source of truth. requiredKinds gets
  // recomputed from the toggles.
  const usingInline = !!formWaivers;
  const effectiveDocuments: WaiverDoc[] = usingInline
    ? inlineLiability
      ? [inlineLiability]
      : []
    : documents;
  const effectiveRequiredKinds: string[] = usingInline
    ? inlineLiability
      ? ["waiver"]
      : []
    : requiredKinds;
  const codeOfConductRequired = usingInline
    ? !!formWaivers?.codeOfConduct.enabled
    : true;
  const showCodeOfConduct = codeOfConductRequired;
  const showPhotoRelease = usingInline
    ? !!formWaivers?.photoRelease.enabled
    : true;

  const requiredOutstanding = effectiveDocuments.filter(
    (d) =>
      effectiveRequiredKinds.includes(d.kind) &&
      !signedVersionIds.has(d.versionId)
  );
  const flags = eligibilityFlags ?? [];
  const checks = [
    {
      label: "Age / division fit",
      flagKey: "age_division_mismatch",
      okBody: "You're within the allowed age range for this division.",
      warnBody: "Age may not match the configured division range. Admin will review."
    },
    {
      label: "No duplicate account",
      flagKey: "duplicate_subject",
      okBody: "No existing profile with matching name + DOB found.",
      warnBody: "Possible duplicate found — admin will review manually."
    },
    {
      label: "USA Hockey ID format",
      flagKey: "usa_hockey_id_format_invalid",
      okBody: "Format valid.",
      warnBody: "USA Hockey ID format is invalid (6–12 alphanumeric)."
    },
    {
      label: "USA Hockey ID — governing body verification",
      flagKey: "usa_hockey_id_unverified",
      okBody: "Verified against USA Hockey roster.",
      warnBody:
        "API verification pending. Admin will review manually. You may continue."
    },
    {
      label: "Level / division match",
      flagKey: "level_division_mismatch",
      okBody: "Level within allowed range for this division.",
      warnBody: "Self-reported level may not match division — admin will review."
    }
  ];

  const continueDisabled =
    requiredOutstanding.length > 0 ||
    (codeOfConductRequired && !codeOfConductAccepted);

  return (
    <div className="space-y-5">
      {/* Card 1 — eligibility checks */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Automated eligibility checks
        </p>
        <ul className="mt-4 divide-y divide-border">
          {checks.map((c) => {
            const failed = flags.includes(c.flagKey);
            return (
              <li
                key={c.flagKey}
                className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span
                  className={
                    failed
                      ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  }
                >
                  {failed ? "!" : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">{c.label}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {failed ? c.warnBody : c.okBody}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Card 2 — Liability waiver(s) */}
      {effectiveDocuments.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              {effectiveDocuments.length === 1
                ? "Liability waiver"
                : `Required documents (${effectiveDocuments.length})`}
            </p>
            {requiredOutstanding.length > 0 ? (
              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-rose-700 dark:text-rose-300">
                Not signed
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                Signed
              </span>
            )}
          </div>
          <ul className="mt-4 space-y-3">
            {effectiveDocuments.map((d) => (
              <WaiverCard
                key={d.documentId}
                doc={d}
                isRequired={effectiveRequiredKinds.includes(d.kind)}
                isSigned={signedVersionIds.has(d.versionId)}
                fullName={fullName}
                onSign={(name) => onSign(d.versionId, name)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Card 3 — Code of conduct (rendered only when enabled in the form) */}
      {showCodeOfConduct ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Code of conduct
            </p>
          </div>
          <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-md border border-border bg-bg-subtle p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">
                {formWaivers?.codeOfConduct.content?.trim() ||
                  "I agree to abide by the league code of conduct"}
              </p>
              <p className="mt-0.5 text-[12px] text-fg-muted">
                Required — acknowledgment must be confirmed before proceeding
              </p>
            </div>
            <ToggleSwitch
              checked={codeOfConductAccepted}
              onChange={onCodeOfConductChange}
              label="Code of conduct"
            />
          </label>
        </section>
      ) : null}

      {/* Card 4 — Photo / media release (rendered only when enabled) */}
      {showPhotoRelease ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Photo / media release
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Optional
            </span>
          </div>
          <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-md border border-border bg-bg-subtle p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">
                {formWaivers?.photoRelease.content?.trim() ||
                  "I consent to the league using my photo and likeness in league media"}
              </p>
              <p className="mt-0.5 text-[12px] text-fg-muted">
                Optional — you can decline without affecting your registration
              </p>
            </div>
            <ToggleSwitch
              checked={photoReleaseAccepted}
              onChange={onPhotoReleaseChange}
              label="Photo / media release"
            />
          </label>
        </section>
      ) : null}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={continueDisabled}>
          {requiredOutstanding.length > 0
            ? `Sign ${requiredOutstanding.length} more required`
            : codeOfConductRequired && !codeOfConductAccepted
              ? "Accept code of conduct"
              : "Next: Payment"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        checked
          ? "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-blue-500 transition-colors"
          : "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-fg-muted/30 transition-colors"
      }
    >
      <span
        className={
          checked
            ? "inline-block h-5 w-5 translate-x-5 rounded-full bg-white shadow transition-transform"
            : "inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform"
        }
      />
    </button>
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
  const docRef = useRef<HTMLDivElement | null>(null);
  const namesMatch =
    typed.trim().toLowerCase() === fullName.trim().toLowerCase();
  // Auto-mark "scrolled to end" when the document is short enough to
  // fit without scrolling — otherwise the Sign button stays disabled
  // forever with no way to satisfy the gate (the bug from the screenshot).
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 8) setScrolled(true);
  }, [doc.contentHtml]);
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
            ref={docRef}
            onScroll={onScroll}
            className="mt-3 max-h-48 overflow-y-auto whitespace-pre-line rounded-md border border-border bg-bg-subtle p-3 text-[12px] leading-relaxed text-fg"
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

/**
 * Phase 2 (Details). Renders the mockup's two-card layout:
 *
 *   - Team information card — only when path=team. Captures team name,
 *     division, primary colour. Per the architectural directive
 *     ('/forms is the source of truth') the player-details fields below
 *     come entirely from the form's active version via FormRenderer —
 *     the mockup's specific fields (DOB, gender, position, USA Hockey ID,
 *     emergency contact, medical notes) are what one well-configured
 *     form produces, not hardcoded in the funnel.
 */
function QuestionsStep({
  definition,
  initialAnswers,
  onChange,
  submissionType,
  teamName,
  teamDivision,
  teamColor,
  onTeamNameChange,
  onTeamDivisionChange,
  onTeamColorChange,
  onBack,
  onNext
}: {
  definition: PublicSeasonContext["formDefinition"];
  initialAnswers: AnswerMap;
  onChange: (next: AnswerMap) => void;
  submissionType: SubmissionType | null;
  teamName: string;
  teamDivision: string;
  teamColor: string;
  onTeamNameChange: (v: string) => void;
  onTeamDivisionChange: (v: string) => void;
  onTeamColorChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const showTeamCard = submissionType === "team";
  const teamValid =
    !showTeamCard ||
    (teamName.trim().length > 0 && teamDivision.trim().length > 0);

  return (
    <div className="space-y-5">
      {showTeamCard ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Team information
            </p>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-blue-700 dark:text-blue-300">
              Team reg
            </span>
          </div>
          <div className="mt-4">
            <Field label="Team name *">
              <Input
                value={teamName}
                onChange={(e) => onTeamNameChange(e.target.value)}
                placeholder="Unique within your division for this season"
                required
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Division *">
              <Input
                value={teamDivision}
                onChange={(e) => onTeamDivisionChange(e.target.value)}
                placeholder="e.g. AHL"
                required
              />
            </Field>
            <Field label="Team colour">
              <input
                type="color"
                value={teamColor}
                onChange={(e) => onTeamColorChange(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface-1 p-1"
                aria-label="Team primary colour"
              />
            </Field>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Player details
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Answers are saved against the question key — labels can be reworded
          in /forms without losing data. Configure these fields from the
          Form builder section in /forms/[id].
        </p>
        <div className="mt-4">
          <FormRenderer
            definition={definition}
            initialAnswers={initialAnswers}
            onChange={onChange}
          />
        </div>
      </section>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!teamValid}>
          Next: Compliance <ArrowRight className="ml-2 h-4 w-4" />
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

/**
 * Phase 4 (Payment). Three-card mockup layout:
 *   1. Your invoice — line items (registration fee + optional discount)
 *      + Total due + discount-code input.
 *   2. Choose a payment option — Full / Payment plan / Offline. The
 *      payment plan card paints the deposit + N installments timeline
 *      when the tier has paymentPlanEnabled.
 *   3. Card details — Stripe-style card / expiry / CVC inputs. Real
 *      tokenisation is a separate ticket; the inputs are presentational
 *      until the Stripe Elements integration ships.
 *
 * Footer: ← Back · Step 5 of 6 · Pay $X →
 */
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
  const [option, setOption] = useState<"full" | "plan" | "offline">(
    tier?.paymentPlanEnabled ? "plan" : "full"
  );
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscountPct, setAppliedDiscountPct] = useState(0);

  const free = !tier || tier.isFree || tier.fullPriceCents === 0;
  const currency = tier?.currency ?? "USD";
  const fullPriceCents = tier?.fullPriceCents ?? 0;
  const discountCents = Math.round(fullPriceCents * (appliedDiscountPct / 100));
  const totalCents = fullPriceCents - discountCents;
  const depositCents = tier?.depositCents ?? 0;
  const installmentCount = tier?.installmentCount ?? 0;
  const installmentAmountCents =
    installmentCount > 0
      ? Math.round((totalCents - depositCents) / installmentCount)
      : 0;
  const intervalDays = tier?.installmentIntervalDays ?? 30;

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(cents / 100);

  function applyDiscount() {
    // Visual stub — real coupon resolution lands when the discount-code
    // table ships. For now treat any non-empty code as 10% off so the
    // UI demonstrates the line-item math.
    if (discountCode.trim().length === 0) {
      setAppliedDiscountPct(0);
    } else {
      setAppliedDiscountPct(10);
    }
  }

  // What actually fires on the primary CTA — pick handler by option.
  function handlePay() {
    if (option === "offline") onPayOffline();
    else onPay();
  }

  const ctaAmount =
    option === "plan" && depositCents > 0 ? depositCents : totalCents;

  return (
    <div className="space-y-5">
      {/* Card 1 — Invoice */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Your invoice
        </p>
        <table className="mt-4 w-full">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-2 pr-3 text-[13px] text-fg">
                {tier?.name ?? "Registration fee"}
              </td>
              <td className="py-2 text-right font-mono text-[13px] tabular-nums text-fg">
                {fmt(fullPriceCents)}
              </td>
            </tr>
            {appliedDiscountPct > 0 ? (
              <tr>
                <td className="py-2 pr-3 text-[13px] text-fg-muted">
                  Discount code {discountCode.toUpperCase()} ({appliedDiscountPct}%)
                </td>
                <td className="py-2 text-right font-mono text-[13px] tabular-nums text-emerald-700 dark:text-emerald-400">
                  -{fmt(discountCents)}
                </td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-border">
              <td className="py-2 pr-3 text-[13px] font-medium text-fg">
                Total due
              </td>
              <td className="py-2 text-right font-mono text-[14px] font-semibold tabular-nums text-fg">
                {free ? "Free" : fmt(totalCents)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4">
          <Field label="Discount code">
            <div className="flex gap-2">
              <Input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="EARLYBIRD10"
              />
              <Button type="button" variant="secondary" onClick={applyDiscount}>
                Apply
              </Button>
            </div>
          </Field>
        </div>
      </section>

      {/* Card 2 — Payment options */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Choose a payment option
        </p>
        <ul className="mt-4 space-y-3">
          <PaymentOption
            active={option === "full"}
            onSelect={() => setOption("full")}
            title={`Full payment — ${fmt(totalCents)} today`}
            body="Single charge. No further payments."
          />
          {tier?.paymentPlanEnabled ? (
            <PaymentOption
              active={option === "plan"}
              onSelect={() => setOption("plan")}
              title={`Payment plan — ${fmt(depositCents)} deposit today`}
              body={`then ${installmentCount} installment${installmentCount === 1 ? "" : "s"} of ${fmt(installmentAmountCents)} every ${intervalDays} days`}
              extra={
                <ul className="mt-3 space-y-1.5 text-[12px]">
                  <li className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-fg-muted">
                      Today (deposit) — {fmt(depositCents)}
                    </span>
                  </li>
                  {Array.from({ length: installmentCount }).map((_, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-fg-muted">
                        Installment {i + 1} — {fmt(installmentAmountCents)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t border-border pt-2 mt-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      Total collected
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-fg">
                      {fmt(totalCents)}
                    </span>
                  </li>
                </ul>
              }
            />
          ) : null}
          <PaymentOption
            active={option === "offline"}
            onSelect={() => setOption("offline")}
            title="Offline / manual payment"
            body="Cash, cheque, or e-transfer. Admin marks you as paid when received."
          />
        </ul>
      </section>

      {/* Card 3 — Card details (visual; Stripe Elements lands later) */}
      {option !== "offline" ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Card details
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Card number">
              <Input placeholder="1234 5678 9012 3456" autoComplete="cc-number" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Expiry">
                <Input placeholder="MM / YY" autoComplete="cc-exp" />
              </Field>
              <Field label="CVC">
                <Input placeholder="123" autoComplete="cc-csc" />
              </Field>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-fg-muted">
            Card data will be tokenised by Stripe in your browser — SportsPulse
            never sees your card number.
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={submitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSimulateDecline}
            disabled={submitting}
            className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg disabled:opacity-50"
            title="Dev affordance — simulate Stripe declining the charge so the state machine moves to pending_payment."
          >
            Simulate decline
          </button>
          <Button onClick={handlePay} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {option === "offline"
                  ? "Submit for offline payment"
                  : `Pay ${fmt(ctaAmount)}`}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentOption({
  active,
  onSelect,
  title,
  body,
  extra
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  extra?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={
          active
            ? "block w-full rounded-lg border border-blue-500 bg-blue-500/5 p-4 text-left ring-2 ring-blue-500/30"
            : "block w-full rounded-lg border border-border bg-bg-subtle p-4 text-left transition-colors hover:border-fg-muted"
        }
      >
        <p className="text-[13px] font-semibold text-fg">{title}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted">{body}</p>
        {active && extra ? extra : null}
      </button>
    </li>
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
      return { title: "Player registration", subtitle: null };
    case "account":
      return {
        title: "Create your account",
        subtitle: "Phase 1 — Account creation & authentication"
      };
    case "questions":
      return {
        title: "Your details",
        subtitle: "Phase 2 — Player & team information"
      };
    case "consent":
    case "waivers":
      return {
        title: "Compliance & waivers",
        subtitle:
          "Phase 3 — Documents, eligibility checks, and digital signatures"
      };
    case "tier":
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
