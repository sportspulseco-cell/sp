"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button, Dialog } from "@sportspulse/ui";
import {
  GOVERNING_BODY_ID_RULES,
  validateGoverningBodyId
} from "@sportspulse/kernel";
import { compliance } from "@/lib/api/browser-api";

const USA_HOCKEY = GOVERNING_BODY_ID_RULES.USA_HOCKEY;

/**
 * Self-attest entry point for USA Hockey ID. Opens a modal, format-checks
 * client-side (server validates again), POSTs to /compliance/self —
 * which inserts an `identity_verifications` row with source=self_attest
 * + status=pending so an admin can later flip it to verified.
 */
export function UsaHockeyIdForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setValue("");
    setError(null);
    setSuccess(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = validateGoverningBodyId("USA_HOCKEY", value);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setBusy(true);
    try {
      await compliance.submitMyIdentityVerification({
        governingBodyCode: "USA_HOCKEY",
        externalId: check.normalized
      });
      setSuccess(true);
      router.refresh();
      setTimeout(close, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-widest">
          Update USA Hockey ID
        </span>
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title="Submit your USA Hockey ID"
        description="An admin will verify the number against USA Hockey's roster. Updates overwrite any prior submission for this body."
        size="md"
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="usa-hockey-id"
              className="block font-mono text-[10px] uppercase tracking-widest text-fg-muted"
            >
              USA Hockey ID
            </label>
            <input
              id="usa-hockey-id"
              type="text"
              inputMode="text"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              required
              className="mt-1 h-10 w-full rounded-md border border-border bg-surface-1 px-3 text-[14px] text-fg focus:border-accent focus:outline-none"
              placeholder="e.g. ABC1234567"
            />
            <p className="mt-1.5 text-[11px] text-fg-muted">
              Format: {USA_HOCKEY?.formatHint ?? "6–12 alphanumeric characters"}
            </p>
          </div>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
              Submitted — pending admin verification.
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={close} disabled={busy}>
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Cancel
              </span>
            </Button>
            <Button type="submit" disabled={busy || value.trim().length === 0}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Submit
              </span>
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
