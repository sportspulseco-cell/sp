"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { signatureNameMatches } from "@sportspulse/kernel";
import { Button, Field, Input } from "@sportspulse/ui";
import type { WaiverDoc } from "./types";

/**
 * Scroll-to-end + typed-name signature card for one required document.
 * Used by the registration funnel's Compliance step and by the player
 * app's Waivers & documents page, so both sign the same way.
 *
 * `fullName` is the name the signer must type; the API checks the same
 * rule (signatureNameMatches) before it stores the signature. `onSign`
 * must throw on failure so the card can show the error inline.
 */
export function WaiverCard({
  doc,
  isRequired,
  isSigned,
  signedAt,
  fullName,
  onSign
}: {
  doc: WaiverDoc;
  isRequired: boolean;
  isSigned: boolean;
  signedAt?: string | null;
  fullName: string;
  onSign: (signatureName: string) => Promise<void>;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [typed, setTyped] = useState("");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const docRef = useRef<HTMLDivElement | null>(null);
  const namesMatch = signatureNameMatches(typed, fullName);
  // Auto-mark "scrolled to end" when the document is short enough to
  // fit without scrolling — otherwise the Sign button stays disabled
  // forever with no way to satisfy the gate.
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
            {doc.kind.replace(/_/g, " ")} {isRequired && "· required"}
          </p>
          {isSigned && signedAt ? (
            // Viewer-local date: server and browser zones may differ.
            <p className="mt-0.5 text-[12px] text-fg-muted" suppressHydrationWarning>
              Signed on {fmtShortDate(signedAt)}
            </p>
          ) : null}
        </div>
        {isSigned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3" strokeWidth={2.25} />
            Signed
          </span>
        ) : (
          <span className="rounded-full bg-rose-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-rose-700 dark:text-rose-300">
            Not signed
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
                    : `Must match ${fullName.trim() || "your account name"} exactly.`
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
                setSignError(null);
                try {
                  await onSign(typed.trim());
                } catch (e) {
                  setSignError((e as Error).message);
                } finally {
                  setSigning(false);
                }
              }}
            >
              {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign"}
            </Button>
          </div>
          {signError ? (
            <p role="alert" className="mt-2 text-[12px] text-rose-700 dark:text-rose-300">
              Couldn't sign: {signError}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "";
  }
}
