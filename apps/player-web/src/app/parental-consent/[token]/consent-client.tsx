"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Field, Input, Alert, Button } from "@sportspulse/ui";
import { guardianNameAcceptable } from "@sportspulse/kernel";

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Parent-portal confirm/decline UI (UC-28, REG-15). The guardian reads
 * the consent text, types their full legal name and ticks the box; the
 * API stores that as a signed consent record with the text, and only
 * then moves the registration on. Anonymous: the token is the auth.
 * The confirmation card shows what the server stored, not the click.
 * UC-27: the same signature covers the league's documents (liability
 * waiver, code of conduct...), shown here in full; the child does not
 * sign them. `documentsOnly`: consent was given earlier, sign the
 * documents still missing.
 */
export function ParentalConsentClient({
  token,
  childDisplayName,
  seasonName,
  orgName,
  consentTitle,
  consentText,
  guardianEmail,
  documents = [],
  documentsOnly = false
}: {
  token: string;
  childDisplayName: string;
  seasonName: string | null;
  orgName: string | null;
  consentTitle: string;
  consentText: string;
  guardianEmail: string | null;
  documents?: Array<{ key: string; title: string; content: string }>;
  documentsOnly?: boolean;
}) {
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [outcome, setOutcome] = useState<
    { kind: "confirmed"; signedBy: string | null } | { kind: "declined" } | null
  >(null);

  const nameOk = guardianNameAcceptable(name);

  async function submit(action: "confirm" | "decline") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `${API}/public/registration/parental-consent/${encodeURIComponent(token)}/redeem`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "confirm"
              ? { action, guardianName: name.trim(), acknowledged: agreed }
              : { action, ...(name.trim() ? { guardianName: name.trim() } : {}) }
          )
        }
      );
      const text = await res.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      if (!res.ok) {
        // Friendly message rather than raw JSON (BUG-045 family).
        const err = body?.error as { message?: string } | string | undefined;
        const msg =
          (typeof err === "object" ? err?.message : undefined) ??
          (typeof body?.message === "string" ? body.message : undefined) ??
          (typeof err === "string" ? err : undefined) ??
          `Could not record your answer (error ${res.status}). Try again.`;
        throw new Error(msg);
      }
      if (action === "confirm") {
        setOutcome({
          kind: "confirmed",
          signedBy: (body?.signedBy as string | null | undefined) ?? null
        });
      } else {
        setOutcome({ kind: "declined" });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (outcome?.kind === "confirmed") {
    return (
      <section className="mt-8 rounded-2xl border border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)] p-6 dark:bg-[var(--tint-emerald-bg)]">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="h-6 w-6 shrink-0 text-[var(--tint-emerald-fg)]"
            strokeWidth={1.75}
          />
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              {documentsOnly ? "Documents signed and recorded." : "Consent signed and recorded."}
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              {outcome.signedBy ? `Signed by ${outcome.signedBy}. ` : ""}
              {childDisplayName} can now continue to payment. You can close
              this page.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (outcome?.kind === "declined") {
    return (
      <section className="mt-8 rounded-2xl border border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)] p-6 dark:bg-[var(--tint-rose-bg)]">
        <div className="flex items-start gap-3">
          <XCircle
            className="h-6 w-6 shrink-0 text-[var(--tint-rose-fg)]"
            strokeWidth={1.75}
          />
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              Registration declined.
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              The registration has been cancelled. Nothing else to do here.
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
          {documentsOnly ? "Sign the league's documents for " : "Confirm registration for "}
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
              <dt className="text-fg-muted">Organization</dt>
              <dd className="font-medium text-fg">{orgName}</dd>
            </div>
          )}
          {guardianEmail && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-fg-muted">Sent to</dt>
              <dd className="font-medium text-fg">{guardianEmail}</dd>
            </div>
          )}
        </dl>
      </div>

      {documentsOnly ? null : (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-fg">{consentTitle}</p>
          <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-md border border-border bg-bg-subtle p-3 text-[13px] leading-relaxed text-fg">
            {consentText}
          </div>
        </div>
      )}

      {documents.map((d) => (
        <div key={d.key} className="space-y-2">
          <p className="text-[13px] font-semibold text-fg">{d.title}</p>
          <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-md border border-border bg-bg-subtle p-3 text-[13px] leading-relaxed text-fg">
            {d.content}
          </div>
        </div>
      ))}

      <Field
        label="Your full legal name"
        hint="Typing your name is your signature. First and last name."
      >
        <Input
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First and last name"
        />
      </Field>

      <label className="flex items-start gap-2 text-[13px] text-fg">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I am {childDisplayName}&apos;s parent or legal guardian. I have read
          {documentsOnly
            ? " the documents above and agree to them"
            : documents.length > 0
              ? " the consent and the documents above and agree to them"
              : " the consent above and agree to it"}
          {" "}on {childDisplayName}&apos;s behalf.
        </span>
      </label>

      {error && (
        <Alert tone="error">
          {error}
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="lg"
          onClick={() => submit("confirm")}
          disabled={busy !== null || !nameOk || !agreed}
          className="flex-1 gap-2"
        >
          {busy === "confirm" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
              {documentsOnly ? "Sign the documents" : "Sign and confirm registration"}
            </>
          )}
        </Button>
        {documentsOnly ? null : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => submit("decline")}
          disabled={busy !== null}
          className="gap-2"
        >
          {busy === "decline" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <XCircle className="h-4 w-4" strokeWidth={1.75} />
              Decline
            </>
          )}
        </Button>
        )}
      </div>
      {!nameOk || !agreed ? (
        <p className="text-[11px] text-fg-muted">
          To confirm, type your first and last name and tick the box.
        </p>
      ) : null}
    </section>
  );
}
