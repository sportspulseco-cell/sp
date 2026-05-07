"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  type LucideIcon
} from "lucide-react";
import {
  Button,
  Eyebrow,
  Field,
  Input,
  Select,
  cn
} from "@sportspulse/ui";

/**
 * Multi-step sign-up funnel — shared across every SportsPulse app
 * (super-admin, league-admin, org-admin, team-admin, player). Each
 * app supplies a `roleCode` (used in copy + onboarding hand-off) +
 * an `api` adapter that wraps Supabase signUp + a profile-update
 * call.
 *
 * Steps:
 *   1. Welcome — sets context, lets the user back out to /sign-in.
 *   2. Account — email + password (calls `api.signUp`, gets a session).
 *   3. Identity — legal name + preferred name + country (calls
 *      `api.updateProfile`).
 *   4. Done — success card; CTA to /onboarding (which captures
 *      role-profile fields via the existing OnboardingFunnel).
 *
 * Splitting account vs identity matters because account creation
 * needs Supabase only, but identity needs an authenticated API
 * call — so the steps line up with the auth state transitions
 * naturally.
 */

export interface SignUpFunnelApi {
  /** Create a new auth user. Resolve when the session is ready. */
  signUp(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<void>;
  /** Patch the freshly-created profile with identity fields. */
  updateProfile(input: {
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
    countryCode: string | null;
  }): Promise<void>;
}

const COUNTRY_CHOICES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "IN", name: "India" }
];

type Step = "welcome" | "account" | "identity" | "done";

const STEP_ORDER: Step[] = ["welcome", "account", "identity", "done"];

export function SignUpFunnel({
  appName,
  roleLabel,
  signInHref,
  onboardingHref,
  api,
  onComplete
}: {
  /** The app's display name — used in headlines (e.g. "Team Admin"). */
  appName: string;
  /**
   * Human label for the role this app serves (e.g.
   * "Team Admin / Coach"). Drives copy on the welcome step and
   * the success page.
   */
  roleLabel: string;
  /** Where the "Sign in instead" link points. */
  signInHref: string;
  /** Where the "Continue" CTA on the success step routes. */
  onboardingHref: string;
  api: SignUpFunnelApi;
  /** Optional — fired when the user clicks the success CTA. */
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [account, setAccount] = useState({
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [identity, setIdentity] = useState({
    legalFirstName: "",
    legalLastName: "",
    preferredName: "",
    countryCode: "US"
  });

  const stepIndex = STEP_ORDER.indexOf(step);

  async function handleAccountSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (account.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (account.password !== account.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.signUp({
        email: account.email.trim().toLowerCase(),
        password: account.password,
        displayName: identity.preferredName || account.email.split("@")[0]!
      });
      setStep("identity");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIdentitySubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identity.legalFirstName.trim() || !identity.legalLastName.trim()) {
      setError("Legal first and last name are required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.updateProfile({
        legalFirstName: identity.legalFirstName.trim(),
        legalLastName: identity.legalLastName.trim(),
        preferredName: identity.preferredName.trim() || null,
        countryCode: identity.countryCode || null
      });
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-12">
      <Stepper currentIndex={stepIndex} />

      <div className="mt-10 rounded-xl border border-border bg-surface-1 p-8">
        {step === "welcome" && (
          <WelcomeStep
            appName={appName}
            roleLabel={roleLabel}
            signInHref={signInHref}
            onContinue={() => setStep("account")}
          />
        )}
        {step === "account" && (
          <form onSubmit={handleAccountSubmit} className="space-y-5">
            <StepHeader
              step={2}
              total={STEP_ORDER.length}
              title="Create your account"
              hint="We'll send a confirmation email if your project requires it. Otherwise you'll be signed in immediately."
            />
            <Field label="Work email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={account.email}
                onChange={(e) =>
                  setAccount({ ...account, email: e.target.value })
                }
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint="At least 8 characters. We never email you the password."
            >
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={account.password}
                onChange={(e) =>
                  setAccount({ ...account, password: e.target.value })
                }
              />
            </Field>
            <Field label="Confirm password" htmlFor="confirm">
              <Input
                id="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={account.confirmPassword}
                onChange={(e) =>
                  setAccount({ ...account, confirmPassword: e.target.value })
                }
              />
            </Field>
            <ErrorBanner message={error} />
            <Footer
              backLabel="Back"
              onBack={() => setStep("welcome")}
              submitLabel="Create account"
              submitting={submitting}
            />
          </form>
        )}
        {step === "identity" && (
          <form onSubmit={handleIdentitySubmit} className="space-y-5">
            <StepHeader
              step={3}
              total={STEP_ORDER.length}
              title="Tell us who you are"
              hint="Legal name is what we use on official documents (rosters, waivers). Preferred name is what shows up around the app."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal first name" htmlFor="firstName">
                <Input
                  id="firstName"
                  required
                  value={identity.legalFirstName}
                  onChange={(e) =>
                    setIdentity({ ...identity, legalFirstName: e.target.value })
                  }
                />
              </Field>
              <Field label="Legal last name" htmlFor="lastName">
                <Input
                  id="lastName"
                  required
                  value={identity.legalLastName}
                  onChange={(e) =>
                    setIdentity({ ...identity, legalLastName: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field
              label="Preferred name"
              htmlFor="preferredName"
              hint="What teammates and admins see. Defaults to your first name."
            >
              <Input
                id="preferredName"
                value={identity.preferredName}
                onChange={(e) =>
                  setIdentity({ ...identity, preferredName: e.target.value })
                }
                placeholder="Optional"
              />
            </Field>
            <Field label="Country" htmlFor="country">
              <Select
                id="country"
                value={identity.countryCode}
                onChange={(e) =>
                  setIdentity({ ...identity, countryCode: e.target.value })
                }
              >
                {COUNTRY_CHOICES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ErrorBanner message={error} />
            <Footer
              backLabel="Back"
              onBack={() => setStep("account")}
              submitLabel="Continue"
              submitting={submitting}
            />
          </form>
        )}
        {step === "done" && (
          <DoneStep
            appName={appName}
            roleLabel={roleLabel}
            firstName={identity.legalFirstName}
            onboardingHref={onboardingHref}
            onComplete={onComplete}
          />
        )}
      </div>
    </main>
  );
}

function Stepper({ currentIndex }: { currentIndex: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEP_ORDER.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
              i < currentIndex
                ? "border-fg bg-fg text-bg"
                : i === currentIndex
                  ? "border-fg text-fg"
                  : "border-border text-fg-muted"
            )}
          >
            {i < currentIndex ? <Check className="h-3 w-3" strokeWidth={2.5} /> : i + 1}
          </span>
          {i < STEP_ORDER.length - 1 && (
            <span
              className={cn(
                "h-px flex-1",
                i < currentIndex ? "bg-fg" : "bg-border"
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function StepHeader({
  step,
  total,
  title,
  hint
}: {
  step: number;
  total: number;
  title: string;
  hint: string;
}) {
  return (
    <div className="space-y-2">
      <Eyebrow>
        // Step {step} of {total}
      </Eyebrow>
      <h1 className="text-[24px] font-semibold tracking-tight text-fg">
        {title}
      </h1>
      <p className="text-[13px] leading-relaxed text-fg-muted">{hint}</p>
    </div>
  );
}

function WelcomeStep({
  appName,
  roleLabel,
  signInHref,
  onContinue
}: {
  appName: string;
  roleLabel: string;
  signInHref: string;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        step={1}
        total={STEP_ORDER.length}
        title={`Join SportsPulse — ${appName}`}
        hint={`This sign-up is for ${roleLabel}. Different role? Pick the matching console from the SportsPulse landing page.`}
      />
      <ul className="space-y-2 rounded-md border border-border bg-bg-subtle p-4 text-[13px] text-fg-muted">
        <BulletItem>You'll create your account on the next step.</BulletItem>
        <BulletItem>
          We'll capture your legal name + country so admins can verify
          eligibility.
        </BulletItem>
        <BulletItem>
          After signing up you'll finish a short role profile so the app
          knows what to show you.
        </BulletItem>
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={signInHref}
          className="font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:text-fg"
        >
          ← Sign in instead
        </a>
        <Button onClick={onContinue}>
          Get started
          <ArrowRight className="ml-1.5 h-4 w-4" strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  appName,
  roleLabel,
  firstName,
  onboardingHref,
  onComplete
}: {
  appName: string;
  roleLabel: string;
  firstName: string;
  onboardingHref: string;
  onComplete?: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Check className="h-7 w-7" strokeWidth={2.25} />
        </div>
      </div>
      <div className="space-y-2 text-center">
        <Eyebrow>// Step 4 of {STEP_ORDER.length}</Eyebrow>
        <h1 className="text-[24px] font-semibold tracking-tight text-fg">
          You're in{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Your SportsPulse {appName} account is ready. One last short step —
          we'll capture role-specific details so the {roleLabel.toLowerCase()}{" "}
          app knows what to show you.
        </p>
      </div>
      <div className="flex justify-center">
        <a
          href={onboardingHref}
          onClick={() => onComplete?.()}
          className="inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2 font-mono text-[11px] font-medium uppercase tracking-widest text-bg"
        >
          Finish onboarding
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
        </a>
      </div>
    </div>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        strokeWidth={2.25}
      />
      <span>{children}</span>
    </li>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400"
    >
      {message}
    </p>
  );
}

function Footer({
  onBack,
  backLabel,
  submitLabel,
  submitting
}: {
  onBack: () => void;
  backLabel: string;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:text-fg disabled:opacity-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        {backLabel}
      </button>
      <Button type="submit" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            {submitLabel}
            <ArrowRight className="ml-1.5 h-4 w-4" strokeWidth={2} />
          </>
        )}
      </Button>
    </div>
  );
}

// Suppress unused-icon warning when `LucideIcon` is the only export the
// downstream consumer might use; keeps the import-list aligned with
// our other funnel files.
export type { LucideIcon };
