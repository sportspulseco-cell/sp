"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Parent-portal confirm/decline UI. POSTs the redeem endpoint
 * anonymously — token is the auth. On success replaces the form with
 * a confirmation card; on failure surfaces the error text inline.
 */
export function ParentalConsentClient({
  token,
  childDisplayName,
  seasonName,
  orgName
}: {
  token: string;
  childDisplayName: string;
  seasonName: string | null;
  orgName: string | null;
}) {
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"confirmed" | "declined" | null>(null);

  async function submit(action: "confirm" | "decline") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `${API}/public/registration/parental-consent/${encodeURIComponent(token)}/redeem`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        }
      );
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`API ${res.status}: ${errBody}`);
      }
      setOutcome(action === "confirm" ? "confirmed" : "declined");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (outcome === "confirmed") {
    return (
      <section className="mt-8 rounded-2xl border border-emerald-400/40 bg-emerald-50/70 p-6 dark:border-emerald-700/40 dark:bg-emerald-950/30">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300"
            strokeWidth={1.75}
          />
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              Thanks — consent recorded.
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              {childDisplayName}&apos;s registration will now advance to
              payment. You can close this page.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (outcome === "declined") {
    return (
      <section className="mt-8 rounded-2xl border border-rose-400/40 bg-rose-50/70 p-6 dark:border-rose-700/40 dark:bg-rose-950/30">
        <div className="flex items-start gap-3">
          <XCircle
            className="h-6 w-6 shrink-0 text-rose-700 dark:text-rose-300"
            strokeWidth={1.75}
          />
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              Registration declined.
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              The registration has been cancelled and the player has been
              notified. Nothing else to do here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-5 rounded-2xl border border-border bg-surface-1 p-6">
      <div>
        <p className="text-[18px] font-semibold tracking-tight text-fg">
          Confirm registration for{" "}
          <span className="text-fg">{childDisplayName}</span>
        </p>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-bg-subtle text-[13px]">
          {seasonName && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-fg-muted">Season</dt>
              <dd className="font-medium text-fg">{seasonName}</dd>
            </div>
          )}
          {orgName && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-fg-muted">Organisation</dt>
              <dd className="font-medium text-fg">{orgName}</dd>
            </div>
          )}
        </dl>
      </div>

      <p className="text-[12px] text-fg-muted">
        By confirming, you authorise {childDisplayName} to register for this
        season and acknowledge they&apos;ll need to complete any required
        waivers. By declining, the registration will be cancelled and the
        player will be told.
      </p>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => submit("confirm")}
          disabled={busy !== null}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "confirm" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
              Confirm registration
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => submit("decline")}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-4 py-2.5 text-[14px] font-medium text-fg hover:bg-bg-subtle disabled:opacity-50"
        >
          {busy === "decline" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <XCircle className="h-4 w-4" strokeWidth={1.75} />
              Decline
            </>
          )}
        </button>
      </div>
    </section>
  );
}
