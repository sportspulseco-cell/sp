"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { AnswerMap } from "@sportspulse/kernel";
import type { PublicRegistrationApi } from "./public-api";
import type { PublicSeasonContext, PricingTier, SubmissionType, WaiverDoc } from "./types";
import { Button, Eyebrow, Chip, Field, Input } from "@sportspulse/ui";
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
}[] = [
  {
    value: "team",
    title: "Register a team",
    blurb:
      "I'm a captain or team manager bringing a full roster. I'll invite the rest after I'm in."
  },
  {
    value: "individual",
    title: "Register as an individual",
    blurb:
      "I'm signing up to play and I'll either join an existing team or get placed."
  },
  {
    value: "free_agent",
    title: "Join the free-agent pool",
    blurb:
      "I don't have a team yet — put me in the pool and let captains pick me up."
  },
  {
    value: "captain_invite",
    title: "I have a captain's invite",
    blurb:
      "A captain sent me a link. I'll paste my invite token in the next step."
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

  const stepOrder: Step[] = useMemo(() => {
    const out: Step[] = ["path", "account"];
    if (isMinor) out.push("consent");
    if ((waivers?.length ?? 0) > 0) out.push("waivers");
    if (tiers.length > 0) out.push("tier");
    if (hasQuestions) out.push("questions");
    out.push("review", "payment", "done");
    return out;
  }, [isMinor, waivers, tiers.length, hasQuestions]);

  const currentIndex = stepOrder.indexOf(step);
  const visibleSteps = stepOrder.filter((s) => s !== "done");

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 space-y-3">
        <Eyebrow>// Registration · {context.season.sportCode}</Eyebrow>
        <h1 className="text-[34px] font-semibold tracking-tighter text-fg">
          {context.season.name}
        </h1>
        <p className="text-sm text-fg-muted">
          {fmtDate(context.season.startDate)} — {fmtDate(context.season.endDate)}
          {context.season.registrationClosesAt
            ? ` · Registration closes ${fmtDate(context.season.registrationClosesAt)}`
            : ""}
        </p>
      </header>

      <Stepper steps={visibleSteps} currentIndex={currentIndex} />

      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-6">
        {step === "path" && (
          <PathStep
            value={submissionType}
            onChange={setSubmissionType}
            onNext={next}
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

function Stepper({
  steps,
  currentIndex
}: {
  steps: Step[];
  currentIndex: number;
}) {
  const labels: Record<Step, string> = {
    path: "Path",
    account: "Account",
    consent: "Consent",
    waivers: "Waivers",
    tier: "Pricing",
    questions: "Questions",
    review: "Review",
    payment: "Payment",
    done: "Done"
  };
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={
                current
                  ? "inline-flex h-6 items-center gap-1.5 rounded-full bg-accent px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-accent-fg"
                  : done
                  ? "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-fg"
                  : "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-fg-muted"
              }
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2} /> : <span>{i + 1}</span>}
              {labels[s]}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className="h-px w-4 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PathStep({
  value,
  onChange,
  onNext
}: {
  value: SubmissionType | null;
  onChange: (v: SubmissionType) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">How are you signing up?</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Pick the path that fits — you can change it later by reopening this
          link with the same email.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PATHS.map((p) => {
          const on = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={
                on
                  ? "rounded-lg border border-accent bg-accent/5 p-4 text-left ring-2 ring-accent/30 transition-colors"
                  : "rounded-lg border border-border bg-surface-1 p-4 text-left transition-colors hover:border-fg-muted"
              }
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-fg">{p.title}</p>
                {on && <Check className="h-4 w-4 text-accent" strokeWidth={2.25} />}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
                {p.blurb}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!value}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
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
  isMinor
}: {
  email: string;
  submissionId: string;
  resumed: boolean;
  status: string | null;
  isMinor: boolean;
}) {
  const guidance = guidanceFor(status, isMinor);
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Check className="h-6 w-6" strokeWidth={2.25} />
      </div>
      <h2 className="text-xl font-semibold text-fg">{guidance.headline(resumed)}</h2>
      <p className="text-sm text-fg-muted">
        {guidance.body}
        <br />
        Account email:{" "}
        <span className="text-fg">{email}</span>
      </p>
      {status && (
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          state · {status}
        </p>
      )}
      <p className="font-mono text-[11px] text-fg-muted">
        Reference: {submissionId}
      </p>
    </div>
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
