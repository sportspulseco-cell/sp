"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { AnswerMap } from "@sportspulse/kernel";
import { publicRegistration } from "@/lib/api/public-api";
import type { PublicSeasonContext, PricingTier } from "@/lib/api/sdk";
import { Button } from "@/components/ui/button";
import { Eyebrow, Chip } from "@/components/ui/eyebrow";
import { Field, Input } from "@/components/ui/input";
import { FormRenderer } from "@/components/forms/form-renderer";

type SubmissionType = "team" | "individual" | "free_agent" | "captain_invite";
type Step = "path" | "account" | "tier" | "questions" | "review" | "done";

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
  context
}: {
  context: PublicSeasonContext;
}) {
  const [step, setStep] = useState<Step>("path");
  const [submissionType, setSubmissionType] = useState<SubmissionType | null>(
    null
  );
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pricingTierId, setPricingTierId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);

  const tiers = useMemo(
    () => context.pricingTiers.filter((t) => t.isActive),
    [context.pricingTiers]
  );
  const hasQuestions = (context.formDefinition?.questions ?? []).length > 0;

  const stepOrder: Step[] = useMemo(() => {
    const out: Step[] = ["path", "account"];
    if (tiers.length > 0) out.push("tier");
    if (hasQuestions) out.push("questions");
    out.push("review", "done");
    return out;
  }, [tiers.length, hasQuestions]);

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

  async function submit() {
    if (!submissionType || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicRegistration.startSubmission(
        context.season.id,
        {
          email: email.trim(),
          fullName: fullName.trim() || undefined,
          pricingTierId: pricingTierId ?? undefined,
          submissionType,
          answers
        }
      );
      setSubmissionId(result.id);
      setResumed(result.resumed);
      setStep("done");
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
            onEmailChange={setEmail}
            onFullNameChange={setFullName}
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
            error={error}
            submitting={submitting}
            onBack={back}
            onSubmit={submit}
          />
        )}

        {step === "done" && (
          <DoneStep
            email={email}
            submissionId={submissionId!}
            resumed={resumed}
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
    tier: "Pricing",
    questions: "Questions",
    review: "Review",
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
  onEmailChange,
  onFullNameChange,
  onBack,
  onNext
}: {
  email: string;
  fullName: string;
  onEmailChange: (v: string) => void;
  onFullNameChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid = /.+@.+\..+/.test(email.trim());
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Tell us who you are</h2>
        <p className="mt-1 text-sm text-fg-muted">
          We use your email as the resume key — coming back to this link with
          the same address picks up where you left off.
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
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!valid}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>Submit registration</>
          )}
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
  resumed
}: {
  email: string;
  submissionId: string;
  resumed: boolean;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Check className="h-6 w-6" strokeWidth={2.25} />
      </div>
      <h2 className="text-xl font-semibold text-fg">
        {resumed ? "Welcome back" : "You're in"}
      </h2>
      <p className="text-sm text-fg-muted">
        {resumed
          ? "We resumed your existing draft against this season."
          : "We've started a draft registration against this season."}
        <br />
        We'll email <span className="text-fg">{email}</span> with the next step
        (account confirmation + payment).
      </p>
      <p className="font-mono text-[11px] text-fg-muted">
        Reference: {submissionId}
      </p>
    </div>
  );
}

function labelForPath(t: SubmissionType): string {
  return PATHS.find((p) => p.value === t)?.title ?? t;
}
