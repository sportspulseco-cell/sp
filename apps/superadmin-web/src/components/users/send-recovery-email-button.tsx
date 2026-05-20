"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { iam } from "@/lib/api/browser-api";

/**
 * Triggers a Supabase password-recovery email for the user. Confirmation
 * is interactive (window.confirm) and the result lands in a small
 * emerald/rose flash next to the button so the admin sees where the link
 * was mailed. Pattern mirrors SuspendUserButton.
 */
export function SendRecoveryEmailButton({
  userId,
  email
}: {
  userId: string;
  email: string | null;
}) {
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null
  );
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending || !email}
        onClick={() => {
          if (!email) return;
          if (
            !confirm(
              `Send a password-recovery email to ${email}? They'll receive a one-time reset link in their inbox.`
            )
          )
            return;
          setFlash(null);
          start(async () => {
            try {
              const res = await iam.sendRecoveryEmail(userId);
              setFlash({ kind: "ok", msg: `Sent to ${res.email}` });
            } catch (err) {
              setFlash({ kind: "err", msg: (err as Error).message });
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Mail className="h-3 w-3" strokeWidth={1.75} />
        )}
        Send recovery email
      </button>
      {flash ? (
        <span
          className={
            flash.kind === "ok"
              ? "rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
              : "rounded-md bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rose-600 dark:text-rose-400"
          }
        >
          {flash.msg}
        </span>
      ) : null}
    </div>
  );
}
