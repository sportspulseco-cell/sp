"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import type { InvoiceEscalationWithInvoice } from "@sportspulse/api-client";
import { finance } from "@/lib/api/browser-api";

/**
 * Per-row action buttons. Each click stamps last_action_kind on the
 * escalation row + does the action's underlying mutation:
 *
 *   Mark paid  → recordPayment for the outstanding balance + patchEscalation
 *   Message    → patchEscalation only (real notification dispatch lives
 *                in the worker; this is the audit anchor)
 *   Extend     → prompts for a date, patches extendedDueAt
 *   Suppress   → flips lockSuspended=false (admin chooses to ignore)
 *   Waive flag → flips lockSuspended=false + stamps flag_waived_at/by
 */
export function OverdueRowActions({
  escalation
}: {
  escalation: InvoiceEscalationWithInvoice;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inv = escalation.invoice;

  async function handle(kind: "mark_paid" | "message" | "extend" | "suppress" | "waive_flag") {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "mark_paid") {
        // Stamp the action; the actual recordPayment call happens on
        // the Player invoice tab where orgId + payment method context
        // are visible. This patch unblocks the workflow audit trail.
        await finance.patchEscalation(escalation.id, {
          lastActionKind: "mark_paid"
        });
      } else if (kind === "extend") {
        const next = window.prompt("Extend due date to (YYYY-MM-DD):");
        if (!next) {
          setBusy(null);
          return;
        }
        const iso = new Date(next + "T23:59:59").toISOString();
        const reason = window.prompt("Reason for extension (optional):") ?? "";
        await finance.extendDueDate(inv.id, { newDueAt: iso, reason });
        await finance.patchEscalation(escalation.id, {
          extendedDueAt: iso,
          lastActionKind: "extend"
        });
      } else if (kind === "waive_flag") {
        const reason = window.prompt(
          "Reason for waiving the late fee (min 10 chars):"
        );
        if (!reason || reason.trim().length < 10) {
          setError("Need a reason of at least 10 characters.");
          setBusy(null);
          return;
        }
        await finance.waiveLateFee(inv.id, reason.trim());
        await finance.patchEscalation(escalation.id, {
          lockSuspended: false,
          lastActionKind: "waive_flag"
        });
      } else if (kind === "suppress") {
        await finance.patchEscalation(escalation.id, {
          lockSuspended: false,
          lastActionKind: "suppress"
        });
      } else {
        // message — fire an out-of-schedule manual reminder.
        await finance.manualRemind(inv.id, "email");
        await finance.patchEscalation(escalation.id, {
          lastActionKind: "message"
        });
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Choose which buttons to render based on escalation state.
  const buttons: { kind: typeof busy; label: string; disabled?: boolean }[] =
    escalation.lockSuspended
      ? [
          { kind: "mark_paid", label: "Mark paid" },
          { kind: "waive_flag", label: "Waive flag" }
        ]
      : [
          { kind: "mark_paid", label: "Mark paid" },
          { kind: "message", label: "Message" },
          { kind: "extend", label: "Extend" },
          { kind: "suppress", label: "Suppress" }
        ];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {buttons.map((b) => (
        <Button
          key={b.label}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handle(b.kind as "mark_paid" | "message" | "extend" | "suppress" | "waive_flag")}
          disabled={busy !== null}
        >
          {busy === b.kind ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            {b.label}
          </span>
        </Button>
      ))}
      <Link
        href={`/payments?tab=invoice&invoiceId=${inv.id}`}
        className="font-mono text-[10px] uppercase tracking-widest text-fg-muted underline hover:text-fg"
      >
        Open invoice →
      </Link>
      {error ? (
        <span className="font-mono text-[11px] text-rose-700 dark:text-rose-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
