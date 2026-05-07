"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  ROLE_PROFILE_SCHEMAS,
  SYSTEM_ROLE_BY_CODE,
  visibleQuestions,
  type AnswerMap,
  type FormDefinition,
  type FormQuestion
} from "@sportspulse/kernel";
import { Button, Eyebrow } from "@sportspulse/ui";
import { FormRenderer } from "./form-renderer";

/**
 * Post-signin onboarding wizard. Lives in @sportspulse/registration-funnel
 * alongside the public season-registration funnel because both share the
 * same multi-step UX pattern — same `<FormRenderer>` underneath, same
 * stepper, same look. Per repo owner directive 2026-05-09:
 * "multi step onboarding or registration should be there in all apps,
 * that's better ui/ux".
 *
 * Each role-targeted app (player / org-admin / team-admin / superadmin)
 * mounts this at /onboarding. Middleware redirects users without
 * `app_metadata.profile_complete` here on every request, so first-time
 * sign-ins always land on onboarding.
 *
 * Schema source is admin-configured first (registration_forms with
 * purpose=role_profile) and falls back to ROLE_PROFILE_SCHEMAS in
 * @sportspulse/kernel — same precedence as the role-profile editor.
 *
 * Persistence: caller supplies an `api` with `setRoleProfile` and a
 * `markComplete` callback. We chunk the form's `questions[]` into
 * pages so the user isn't staring at a 13-field wall of text. Save
 * happens at the end (no per-step partial saves yet — Wave-E if the
 * resume story matters).
 */

const QUESTIONS_PER_PAGE = 4;

export interface OnboardingApi {
  /** Returns the saved-so-far answers + the schema (admin or kernel). */
  loadOnboarding(userId: string, roleCode: string): Promise<{
    answers: AnswerMap;
    schema: FormDefinition;
    schemaSource: "admin" | "kernel-default";
  }>;
  /** Persist answers + flip app_metadata.profile_complete = true. */
  completeOnboarding(
    userId: string,
    roleCode: string,
    data: AnswerMap
  ): Promise<void>;
}

export function OnboardingFunnel({
  userId,
  userType,
  api,
  onComplete,
  showWelcome = true
}: {
  userId: string;
  /** The user's primary role code (player / org_admin / etc.). */
  userType: string;
  api: OnboardingApi;
  /**
   * Called after the wizard finishes successfully. Each app supplies
   * a router-aware redirect (e.g. `() => router.replace("/")`).
   */
  onComplete: () => void;
  /** Drop the welcome step — useful when re-entering mid-flow. */
  showWelcome?: boolean;
}) {
  const roleDef = SYSTEM_ROLE_BY_CODE[userType];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [schema, setSchema] = useState<FormDefinition>(() =>
    ROLE_PROFILE_SCHEMAS[userType] ?? { schemaVersion: 1, questions: [] }
  );
  const [schemaSource, setSchemaSource] = useState<"admin" | "kernel-default">(
    "kernel-default"
  );
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .loadOnboarding(userId, userType)
      .then((r) => {
        if (cancelled) return;
        setSchema(r.schema);
        setSchemaSource(r.schemaSource);
        setAnswers(r.answers);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, userId, userType]);

  // Chunk schema questions into pages. We honour `visibleQuestions`
  // for conditional logic so a hidden field doesn't burn a page slot.
  const pages = useMemo<FormQuestion[][]>(() => {
    const visible = visibleQuestions(schema, answers);
    const out: FormQuestion[][] = [];
    for (let i = 0; i < visible.length; i += QUESTIONS_PER_PAGE) {
      out.push(visible.slice(i, i + QUESTIONS_PER_PAGE));
    }
    if (out.length === 0) out.push([]); // single empty page if no questions
    return out;
  }, [schema, answers]);

  // Step list: optional welcome + N form pages + done
  const steps: { key: string; label: string }[] = useMemo(() => {
    const out = [];
    if (showWelcome) out.push({ key: "welcome", label: "Welcome" });
    for (let i = 0; i < pages.length; i++) {
      out.push({ key: `page-${i}`, label: `Page ${i + 1}` });
    }
    out.push({ key: "done", label: "Done" });
    return out;
  }, [pages.length, showWelcome]);

  const totalForms = pages.length;
  const currentStep = steps[stepIndex] ?? steps[0]!;
  const isWelcome = currentStep.key === "welcome";
  const isDone = currentStep.key === "done";
  const formPageIndex = isWelcome
    ? -1
    : isDone
    ? totalForms
    : stepIndex - (showWelcome ? 1 : 0);

  function next() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      await api.completeOnboarding(userId, userType, answers);
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 space-y-2">
        <Eyebrow>// Onboarding · {userType}</Eyebrow>
        <h1 className="text-[34px] font-semibold tracking-tighter text-fg">
          Welcome to SportsPulse
        </h1>
        <p className="text-sm text-fg-muted">
          Tell us a few things so we can set up your{" "}
          {roleDef?.name ?? userType} profile.
          {schemaSource === "admin" ? " Form configured by your league admin." : ""}
        </p>
      </header>

      <Stepper steps={steps} current={stepIndex} />

      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-6">
        {isWelcome && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-fg">
              {totalForms > 0
                ? `${totalForms} step${totalForms === 1 ? "" : "s"} to go`
                : "All set"}
            </h2>
            <p className="text-sm text-fg-muted">
              Most of these fields are optional. Anything required is marked
              with an asterisk. You can come back and edit later.
            </p>
            <div className="flex justify-end">
              <Button onClick={next} disabled={totalForms === 0}>
                {totalForms === 0 ? "Skip" : "Get started"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {!isWelcome && !isDone && (
          <PageStep
            page={pages[formPageIndex]!}
            answers={answers}
            onChange={setAnswers}
            onBack={back}
            onNext={next}
            isLast={formPageIndex === totalForms - 1}
          />
        )}

        {isDone && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <h2 className="text-xl font-semibold text-fg">Looks good</h2>
            <p className="text-sm text-fg-muted">
              We'll save your profile and take you to the {roleDef?.name ?? "app"} home.
            </p>
            {error && (
              <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
            <div className="flex justify-center gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={back} disabled={submitting}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={finish} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Finish"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function PageStep({
  page,
  answers,
  onChange,
  onBack,
  onNext,
  isLast
}: {
  page: FormQuestion[];
  answers: AnswerMap;
  onChange: (next: AnswerMap) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  // Build a tiny FormDefinition holding only this page's questions so
  // FormRenderer renders just them.
  const def: FormDefinition = useMemo(
    () => ({ schemaVersion: 1, questions: page }),
    [page]
  );

  // Block "Continue" if any required field on this page is unfilled.
  const requiredMissing = page.some((q) => {
    if (!q.required) return false;
    const v = answers[q.key];
    if (v === undefined || v === null || v === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });

  return (
    <div className="space-y-5">
      <FormRenderer
        definition={def}
        initialAnswers={answers}
        onChange={onChange}
      />
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={requiredMissing}>
          {isLast ? "Review" : "Continue"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Stepper({
  steps,
  current
}: {
  steps: { key: string; label: string }[];
  current: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={
                isCurrent
                  ? "inline-flex h-6 items-center gap-1.5 rounded-full bg-accent px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-accent-fg"
                  : done
                  ? "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-fg"
                  : "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-fg-muted"
              }
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2} /> : <span>{i + 1}</span>}
              {s.label}
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
