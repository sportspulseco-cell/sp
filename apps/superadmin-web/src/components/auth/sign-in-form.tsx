"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Info, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const ERROR_MESSAGES: Record<string, string> = {
  session_expired: "Your session expired. Sign in again to continue.",
  // Aligned with the role-targeted apps (org-admin / team-admin / player)
  // which all use ?error=wrong_role. `not_authorized` kept as an alias for
  // backwards compatibility with any old links that may still be in users'
  // browser history.
  wrong_role: "You are not authorized to access the admin console.",
  not_authorized: "You are not authorized to access the admin console.",
  signed_out: "You've been signed out."
};

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const errorCode = params.get("error");
  const banner = errorCode ? ERROR_MESSAGES[errorCode] : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Tracks whether the user currently has a Supabase session. When
  // they got bounced to /sign-in with ?error=not_authorized this is
  // true — they need a sign-out CTA, not a sign-in form (BUG-002).
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setSignedInEmail(data.user?.email ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function onSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut().catch(() => undefined);
    setSigningOut(false);
    setSignedInEmail(null);
    // Strip the ?error param so the middleware no longer keeps us
    // pinned here, and so the form switches back to its default state.
    router.replace("/sign-in");
    router.refresh();
  }

  // Wrong-role recovery panel: user is signed in to Supabase but the
  // (admin) layout rejected them. Show their email + a sign-out CTA
  // instead of the empty sign-in form so they can switch accounts.
  if (
    signedInEmail &&
    (errorCode === "wrong_role" || errorCode === "not_authorized")
  ) {
    return (
      <div className="space-y-5">
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {ERROR_MESSAGES.wrong_role}
        </p>
        <div className="rounded-md border border-border bg-surface-1 px-4 py-3">
          <p className="text-[11px] font-mono uppercase tracking-wide text-fg-muted">
            Currently signed in as
          </p>
          <p className="mt-1 text-sm text-fg">{signedInEmail}</p>
        </div>
        <Button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          pill
          size="lg"
          className="w-full gap-2"
        >
          {signingOut ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing out…
            </>
          ) : (
            <>
              Sign out and try a different account
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </>
          )}
        </Button>
        <p className="text-xs text-fg-muted">
          This account is signed in but doesn't have super-admin access. Use
          the matching app for your role — org-admin, team-admin, or player —
          or sign out above and sign in with a super-admin account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {banner ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {banner}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="font-mono text-[11px] uppercase tracking-wide text-fg-muted"
        >
          Work email
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label
          htmlFor="password"
          className="font-mono text-[11px] uppercase tracking-wide text-fg-muted"
        >
          Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        pill
        size="lg"
        className="w-full gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </>
        )}
      </Button>
    </form>
  );
}
