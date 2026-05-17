"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  Mail,
  RotateCcw,
  ShieldAlert,
  Wallet,
  X
} from "lucide-react";
import {
  REGISTRATION_STATE_LABELS,
  REGISTRATION_STATES,
  type RegistrationState
} from "@sportspulse/kernel";
import { registrationV2Admin } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

interface Submission {
  id: string;
  status: string;
  orgId: string;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Phase 5 admin review queue.
 *
 * Multi-select + bulk actions per Workflow 1 v2 §8.1. Drives the new
 * registrationV2Admin endpoints — same kernel state machine guards
 * the API enforces, so the UX surfaces only valid actions per state.
 */
/**
 * Special filter value bundling every state that needs an admin
 * decision: `pending_review` (paid online) + `pending_offline`
 * (player claims they paid offline; admin verifies). This is the
 * default so offline-pay submissions don't go invisible.
 */
const NEEDS_DECISION = "__needs_decision__" as const;
type StatusFilterValue = RegistrationState | "" | typeof NEEDS_DECISION;

export function ReviewQueue() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(
    NEEDS_DECISION
  );
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Dialogs
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Submission | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await registrationV2Admin.listSubmissions({
        status:
          statusFilter && statusFilter !== NEEDS_DECISION
            ? statusFilter
            : undefined,
        statuses:
          statusFilter === NEEDS_DECISION
            ? "pending_review,pending_offline"
            : undefined,
        search: search.trim() || undefined,
        limit: 100
      });
      setItems(res.items);
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((i) => i.id));
    });
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    if (!confirm(`Approve ${selected.size} submission(s)?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await registrationV2Admin.bulkApprove([...selected]);
      setFlash(
        `Approved ${res.applied}/${res.matched} (skipped ${res.skipped} not awaiting decision). Email delivered to ${res.emailDelivered}.`
      );
      router.refresh();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-subtle p-3">
        <div className="grid w-full max-w-xs gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            State
          </label>
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as StatusFilterValue)
            }
          >
            <option value={NEEDS_DECISION}>Needs decision (review + offline)</option>
            <option value="">All</option>
            {REGISTRATION_STATES.map((s) => (
              <option key={s} value={s}>
                {REGISTRATION_STATE_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid flex-1 min-w-[200px] gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Search
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") refresh();
            }}
            placeholder="Email or name…"
          />
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* Bulk action bar — only when there's a selection */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 p-3">
          <span className="font-mono text-[11px] text-fg">
            {selected.size} selected
          </span>
          <Button onClick={bulkApprove} disabled={busy}>
            <Check className="mr-2 h-4 w-4" /> Bulk approve
          </Button>
          <Button
            variant="secondary"
            onClick={() => setBulkRejectOpen(true)}
            disabled={busy}
          >
            <X className="mr-2 h-4 w-4" /> Bulk reject
          </Button>
          <Button
            variant="ghost"
            onClick={() => setBulkEmailOpen(true)}
            disabled={busy}
          >
            <Mail className="mr-2 h-4 w-4" /> Email selected
          </Button>
          <Button
            variant="ghost"
            onClick={() => setSelected(new Set())}
            disabled={busy}
          >
            Clear
          </Button>
        </div>
      )}

      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* Table */}
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-8 text-center text-[13px] text-fg-muted">
          No submissions match this filter.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-8">
                <input
                  type="checkbox"
                  checked={selected.size === items.length}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 accent-accent"
                />
              </TH>
              <TH>Registrant</TH>
              <TH>Path</TH>
              <TH>State</TH>
              <TH>Flags</TH>
              <TH>Submitted</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((r) => (
              <Row
                key={r.id}
                row={r}
                checked={selected.has(r.id)}
                onToggle={() => toggle(r.id)}
                onReview={() => setReviewing(r)}
              />
            ))}
          </TBody>
        </Table>
      )}

      {/* Bulk reject dialog */}
      <BulkRejectDialog
        open={bulkRejectOpen}
        onClose={() => setBulkRejectOpen(false)}
        count={selected.size}
        onConfirm={async (reason) => {
          setBusy(true);
          setError(null);
          try {
            const res = await registrationV2Admin.bulkReject(
              [...selected],
              reason
            );
            setFlash(
              `Rejected ${res.applied}/${res.matched} (skipped ${res.skipped}). Emails: ${res.emailDelivered}.`
            );
            setBulkRejectOpen(false);
            router.refresh();
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
      />

      {/* Bulk email dialog */}
      <BulkEmailDialog
        open={bulkEmailOpen}
        onClose={() => setBulkEmailOpen(false)}
        count={selected.size}
        onConfirm={async (subject, body) => {
          setBusy(true);
          setError(null);
          try {
            const res = await registrationV2Admin.bulkEmail(
              [...selected],
              subject,
              body
            );
            setFlash(
              `Bulk email · matched ${res.matched}, delivered ${res.delivered}, log-only ${res.logOnly}.`
            );
            setBulkEmailOpen(false);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
      />

      {/* Per-row review dialog */}
      <ReviewDialog
        submission={reviewing}
        onClose={() => setReviewing(null)}
        onApplied={async () => {
          setReviewing(null);
          router.refresh();
          await refresh();
        }}
      />
    </div>
  );
}

function Row({
  row,
  checked,
  onToggle,
  onReview
}: {
  row: Submission;
  checked: boolean;
  onToggle: () => void;
  onReview: () => void;
}) {
  const meta = row.metadata as Record<string, unknown>;
  const elig = (meta.eligibilityChecks as { flags?: string[] } | undefined) ?? {};
  const flags = elig.flags ?? [];
  const isOffline = row.status === "pending_offline";
  return (
    <TR>
      <TD>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-accent"
        />
      </TD>
      <TD className="font-medium">
        <p>{(meta.fullName as string) ?? "—"}</p>
        <p className="text-[11px] text-fg-muted">{meta.email as string}</p>
      </TD>
      <TD className="text-muted-foreground">
        <span className="font-mono text-[11px] uppercase">
          {(meta.submissionType as string) ?? "individual"}
        </span>
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(row.status)}>
            {row.status.replace(/_/g, " ")}
          </Badge>
          {isOffline && (
            <span
              title="Player chose offline payment — verify receipt before approving."
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
            >
              <Wallet className="h-2.5 w-2.5" />
              paid offline · verify
            </span>
          )}
        </div>
      </TD>
      <TD>
        {flags.length === 0 ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {f}
              </span>
            ))}
          </div>
        )}
      </TD>
      <TD className="text-muted-foreground">
        {row.submittedAt
          ? new Date(row.submittedAt).toLocaleDateString("en-CA")
          : new Date(row.createdAt).toLocaleDateString("en-CA")}
      </TD>
      <TD className="text-right">
        <Button variant="ghost" onClick={onReview}>
          Review
        </Button>
      </TD>
    </TR>
  );
}

function BulkRejectDialog({
  open,
  onClose,
  count,
  onConfirm,
  busy
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Bulk reject ${count} submission(s)`}
      description="One shared reason is applied to all selected rows. Refunds are issued per league policy."
    >
      <Field label="Rejection reason" hint="Sent verbatim in the player email.">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Division is full for the season."
        />
      </Field>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(reason)} disabled={!reason.trim() || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject all"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BulkEmailDialog({
  open,
  onClose,
  count,
  onConfirm,
  busy
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: (subject: string, body: string) => void;
  busy: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Email ${count} registrant(s)`}
      description="Sends via Resend (real or log-only based on RESEND_API_KEY). State is unchanged — this is purely communications."
      size="lg"
    >
      <Field label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-border bg-surface-1 p-2 text-sm text-fg"
        />
      </Field>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(subject, body)}
          disabled={!subject.trim() || !body.trim() || busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReviewDialog({
  submission,
  onClose,
  onApplied
}: {
  submission: Submission | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideFlag, setOverrideFlag] = useState("");

  if (!submission) return null;
  const meta = submission.metadata as Record<string, unknown>;
  const elig = (meta.eligibilityChecks as { flags?: string[] } | undefined) ?? {};
  const flags = elig.flags ?? [];
  const flagOverrides = ((meta.flagOverrides as Record<string, unknown>) ??
    {}) as Record<string, unknown>;
  const payment =
    (meta.payment as { outcome?: string; amountCents?: number; currency?: string } | undefined) ??
    undefined;
  const isOffline = submission.status === "pending_offline";

  async function apply(
    action: "approve" | "reject" | "request_resubmission" | "override_flag"
  ) {
    setBusy(true);
    setError(null);
    try {
      await registrationV2Admin.review(submission!.id, {
        action,
        reason: reason.trim() || undefined,
        flagKey: action === "override_flag" ? overrideFlag : undefined
      });
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="Review submission"
      description={`State: ${submission.status} · ${(meta.fullName as string) ?? meta.email}`}
      size="lg"
    >
      <div className="space-y-4">
        {isOffline && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Offline payment claimed</p>
              <p className="text-amber-700/90 dark:text-amber-200/80">
                The player chose offline payment
                {payment?.amountCents
                  ? ` (${(payment.amountCents / 100).toFixed(2)} ${payment.currency ?? "USD"})`
                  : ""}
                . Verify receipt before approving — approving from here marks the registration final.
              </p>
            </div>
          </div>
        )}
        <dl className="divide-y divide-border rounded-md border border-border bg-surface-1 text-sm">
          <Row2 label="Email">{meta.email as string}</Row2>
          <Row2 label="Path">{(meta.submissionType as string) ?? "—"}</Row2>
          <Row2 label="DOB">{(meta.dobDate as string) ?? "—"}</Row2>
          <Row2 label="Tier">
            {(meta.pricingTierId as string)?.slice(0, 8) ?? "—"}
          </Row2>
          {flags.length > 0 && (
            <Row2 label="Eligibility flags">
              <div className="flex flex-wrap justify-end gap-1">
                {flags.map((f) => {
                  const overridden = flagOverrides[f];
                  return (
                    <span
                      key={f}
                      className={
                        overridden
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
                          : "inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                      }
                    >
                      {overridden ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <ShieldAlert className="h-2.5 w-2.5" />
                      )}
                      {f}
                    </span>
                  );
                })}
              </div>
            </Row2>
          )}
        </dl>

        <Field
          label="Reason / note (optional)"
          hint="Included verbatim in the registrant's email; required for reject + request_resubmission."
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-surface-1 p-2 text-sm text-fg"
          />
        </Field>

        {flags.length > 0 && (
          <Field
            label="Override flag (optional)"
            hint="Pick a flag to mark as overridden — admin justification goes in the reason field above."
          >
            <Select
              value={overrideFlag}
              onChange={(e) => setOverrideFlag(e.target.value)}
            >
              <option value="">— none —</option>
              {flags.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {overrideFlag && (
            <Button
              variant="secondary"
              onClick={() => apply("override_flag")}
              disabled={busy || !reason.trim()}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Override flag
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => apply("request_resubmission")}
            disabled={busy || !reason.trim()}
          >
            Request resubmission
          </Button>
          <Button
            variant="secondary"
            onClick={() => apply("reject")}
            disabled={busy || !reason.trim()}
          >
            <X className="mr-2 h-4 w-4" /> Reject
          </Button>
          <Button onClick={() => apply("approve")} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Approve
              </>
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

function Row2({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
      <dd className="text-right text-[12px] text-fg">{children}</dd>
    </div>
  );
}
