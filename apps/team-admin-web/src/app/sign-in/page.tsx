"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Input, Eyebrow } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Team Admin sign-in.
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
  const [error, setError] = useState<string | null>(
    sp.get("error") === "wrong_role"
      ? "This account doesn't have team admin / coach access. Try a different sign-in or contact your admin."
      : null
  );

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
          <Eyebrow>// sp-team-admin</Eyebrow>
          <h1 className="text-[28px] font-semibold tracking-tight text-fg">
            Sign in · Team Admin
          </h1>
          <p className="text-[12px] text-fg-muted">
            For team admin / coach accounts only. Different role? Use the matching app.
          </p>
        </div>
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
        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting || !email || !password}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
