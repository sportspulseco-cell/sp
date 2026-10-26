"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input, Eyebrow } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Org Admin sign-in.
 *
 * Per the repo owner's directive (2026-05-09) each role-targeted
 * app has its own sign-in landing — same Supabase project under the
 * hood, separate cookies + separate gates per app.
 *
 * Wrapped in Suspense because useSearchParams requires it under
 * Next 15 prerender; force-dynamic keeps the route off the static
 * pre-render path entirely.
 */
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read on every render: after a wrong-role bounce the app redirects
  // back here and this component keeps its state, so a message set only
  // when it first mounted never showed (J17).
  const roleError =
    sp.get("error") === "wrong_role"
      ? "You're signed in, but this account isn't an admin of an organization. Sign in with another account here, or use “Pick another app” for the app that fits your role."
      : null;
  const shownError = error ?? roleError;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (err) {
        setError(err.message);
        return;
      }
      router.replace(sp.get("next") ?? "/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-border bg-surface-1 p-8">
        <div className="space-y-1">
          <Eyebrow>SportsPulse</Eyebrow>
          <h1 className="text-[28px] font-semibold tracking-tight text-fg">
            Sign in to your organization
          </h1>
          <p className="text-[12px] text-fg-muted">
            For people who run a club or organization: leagues, seasons, teams and invoices.{" "}
            <a href={(process.env.NEXT_PUBLIC_LANDING_URL ?? "https://sportspulse.us") + "/sign-in"} className="underline underline-offset-2 hover:text-fg">
              Not you? Pick another app
            </a>
          </p>
        </div>
        {shownError && <Alert tone="error">{shownError}</Alert>}
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={submitting || !email || !password}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
