"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { finance, iam } from "@/lib/api/browser-api";
import type { Org, FeeSchedule, Person } from "@/lib/api/types";

type Scope = "individual" | "team" | "division" | "league" | "season" | "org";

type LineItem = {
  description: string;
  kind: string;
  quantity: number;
  unitAmountCents: number;
};

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: "individual", label: "Individual" },
  { value: "team", label: "Team" },
  { value: "division", label: "Division" },
  { value: "league", label: "League" },
  { value: "season", label: "Season" },
  { value: "org", label: "Org" }
];

const KINDS = [
  { value: "registration", label: "registration" },
  { value: "team_dues", label: "team_dues" },
  { value: "tournament", label: "tournament" },
  { value: "kit", label: "kit" },
  { value: "fine", label: "fine" },
  { value: "manual", label: "manual" }
];

export function NewInvoiceDialog({
  open,
  onClose,
  orgs,
  feeSchedules,
  defaultOrgId
}: {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
  feeSchedules: FeeSchedule[];
  defaultOrgId?: string;
}) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string>(
    defaultOrgId ?? orgs[0]?.id ?? ""
  );
  const [scope, setScope] = useState<Scope>("individual");
  const [recipient, setRecipient] = useState<Person | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", kind: "registration", quantity: 1, unitAmountCents: 0 }
  ]);
  const [dueDate, setDueDate] = useState<string>("");
  const [feeScheduleId, setFeeScheduleId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [paymentPlan, setPaymentPlan] = useState(false);
  const [depositCents, setDepositCents] = useState(0);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [firstInstallmentAt, setFirstInstallmentAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgFeeSchedules = useMemo(
    () => feeSchedules.filter((s) => s.orgId === orgId),
    [feeSchedules, orgId]
  );

  // Default to first org once orgs hydrate.
  useEffect(() => {
    if (!orgId && orgs[0]) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  // Recipient autocomplete — debounce queries to iam.listPersons.
  useEffect(() => {
    if (scope !== "individual" || !recipientSearch.trim()) {
      setPeople([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await iam.listPersons({
          search: recipientSearch.trim(),
          limit: 8
        });
        setPeople(r.items);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [recipientSearch, scope]);

  const subtotalCents = lineItems.reduce(
    (a, i) => a + (i.unitAmountCents || 0) * (i.quantity || 1),
    0
  );

  function addLine() {
    setLineItems((arr) => [
      ...arr,
      { description: "", kind: "manual", quantity: 1, unitAmountCents: 0 }
    ]);
  }
  function removeLine(idx: number) {
    setLineItems((arr) => arr.filter((_, i) => i !== idx));
  }
  function patchLine(idx: number, patch: Partial<LineItem>) {
    setLineItems((arr) =>
      arr.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    );
  }

  function reset() {
    setScope("individual");
    setRecipient(null);
    setRecipientSearch("");
    setPeople([]);
    setTargetId("");
    setLineItems([
      { description: "", kind: "registration", quantity: 1, unitAmountCents: 0 }
    ]);
    setDueDate("");
    setFeeScheduleId("");
    setNotes("");
    setPaymentPlan(false);
    setDepositCents(0);
    setInstallmentCount(3);
    setFirstInstallmentAt("");
    setError(null);
  }

  async function submit(asDraft: boolean) {
    setError(null);
    if (!orgId) return setError("Pick an organisation.");
    if (lineItems.length === 0)
      return setError("Add at least one line item.");
    for (const l of lineItems) {
      if (!l.description.trim()) return setError("Each line item needs a description.");
      if (!(l.unitAmountCents > 0)) return setError("Each line item needs a non-zero amount.");
    }
    if (scope === "individual" && !recipient)
      return setError("Pick a recipient for an individual invoice.");
    if (scope !== "individual" && !targetId)
      return setError(`Pick the ${scope} this invoice targets.`);
    if (!dueDate) return setError("Set a due date.");

    setBusy(true);
    try {
      const resolvedTargetId =
        scope === "individual" ? recipient!.id : targetId;
      await finance.createBulkInvoice(
        {
          orgId,
          billingScope: scope,
          targetId: resolvedTargetId,
          invoiceType: asDraft ? "manual" : undefined,
          items: lineItems.map((l) => ({
            description: l.description.trim(),
            kind: l.kind,
            quantity: l.quantity,
            unitAmountCents: Math.round(l.unitAmountCents)
          })),
          dueAt: new Date(dueDate).toISOString(),
          feeScheduleId: feeScheduleId || undefined,
          notes: notes.trim() || undefined,
          paymentPlanEnabled: paymentPlan,
          depositCents:
            paymentPlan && depositCents > 0 ? Math.round(depositCents) : undefined,
          installmentCount:
            paymentPlan && installmentCount > 0 ? installmentCount : undefined,
          installmentStartDate:
            paymentPlan && firstInstallmentAt
              ? new Date(firstInstallmentAt).toISOString()
              : undefined
        },
        crypto.randomUUID()
      );
      reset();
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New invoice"
      description="Pick a billing scope and recipients, add line items, optionally enable a payment plan, then save as draft or create + send."
      size="lg"
    >
      <div className="space-y-5 text-[13px]">
        {/* Organisation */}
        <Field label="Organisation" required>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </select>
        </Field>

        {/* Billing scope toggle */}
        <Field
          label="Billing scope"
          required
          hint="One invoice will be created per person in the selected scope."
        >
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setScope(s.value);
                  setRecipient(null);
                  setTargetId("");
                }}
                className={[
                  "rounded-md border px-3 py-1.5 text-[12px] transition",
                  scope === s.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-bg text-fg-muted hover:border-fg-muted hover:text-fg"
                ].join(" ")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Recipient (individual) or Target picker */}
        {scope === "individual" ? (
          <Field label="Recipient" required>
            {recipient ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 font-mono text-[12px] font-semibold uppercase text-accent">
                  {initialsFor(recipient)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">
                    {fullName(recipient)}
                  </p>
                  <p className="font-mono text-[11px] text-fg-muted">
                    person · {recipient.id.slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRecipient(null);
                    setRecipientSearch("");
                  }}
                  className="text-fg-muted hover:text-rose-500"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg outline-none focus:border-accent"
                />
                {recipientSearch.trim() && people.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-bg shadow-lg">
                    {people.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setRecipient(p);
                            setRecipientSearch("");
                            setPeople([]);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-subtle"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 font-mono text-[11px] font-semibold uppercase text-accent">
                            {initialsFor(p)}
                          </span>
                          <span className="min-w-0">
                            <p className="text-[13px] font-medium text-fg">
                              {fullName(p)}
                            </p>
                            <p className="font-mono text-[11px] text-fg-muted">
                              person · {p.id.slice(0, 8)}
                            </p>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searching && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-fg-muted" />
                )}
              </div>
            )}
          </Field>
        ) : (
          <Field
            label={`${scope.charAt(0).toUpperCase() + scope.slice(1)} ID`}
            required
            hint={`Paste the UUID of the ${scope} to bill. (Picker coming soon.)`}
          >
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={`${scope} id…`}
              className="h-10 w-full rounded-md border border-border bg-bg px-3 font-mono text-fg outline-none focus:border-accent"
            />
          </Field>
        )}

        {/* Line items */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Line items <span className="text-rose-500">*</span>
          </p>
          <div className="grid grid-cols-[1fr_120px_70px_110px_30px] items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            <span>Description</span>
            <span>Kind</span>
            <span>Qty</span>
            <span>Amount ($)</span>
            <span />
          </div>
          {lineItems.map((l, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_120px_70px_110px_30px] items-center gap-2"
            >
              <input
                type="text"
                value={l.description}
                onChange={(e) => patchLine(idx, { description: e.target.value })}
                placeholder="Fall 2025 registration fee"
                className="h-9 rounded-md border border-border bg-bg px-2 text-fg outline-none focus:border-accent"
              />
              <select
                value={l.kind}
                onChange={(e) => patchLine(idx, { kind: e.target.value })}
                className="h-9 rounded-md border border-border bg-bg px-2 text-fg outline-none focus:border-accent"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={l.quantity}
                onChange={(e) =>
                  patchLine(idx, { quantity: parseInt(e.target.value || "1", 10) })
                }
                className="h-9 rounded-md border border-border bg-bg px-2 text-fg outline-none focus:border-accent"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={l.unitAmountCents > 0 ? (l.unitAmountCents / 100).toFixed(2) : ""}
                onChange={(e) =>
                  patchLine(idx, {
                    unitAmountCents: Math.round(parseFloat(e.target.value || "0") * 100)
                  })
                }
                placeholder="320.00"
                className="h-9 rounded-md border border-border bg-bg px-2 text-fg outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => removeLine(idx)}
                disabled={lineItems.length === 1}
                className="text-fg-muted hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-bg px-3 py-1.5 text-[12px] text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add line item
          </button>
        </div>

        {/* Due date + Fee schedule */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" required>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Fee schedule (optional)">
            <select
              value={feeScheduleId}
              onChange={(e) => setFeeScheduleId(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
            >
              <option value="">None</option>
              {orgFeeSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Internal notes */}
        <Field label="Internal notes (not visible to recipient)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional…"
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg focus:border-accent focus:outline-none"
          />
        </Field>

        {/* Payment plan */}
        <div className="rounded-md border border-border bg-bg-subtle/40 p-3">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={paymentPlan}
              onChange={(e) => setPaymentPlan(e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="font-medium text-fg">Enable payment plan</span>
          </label>
          {paymentPlan && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Field label="Deposit ($)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={depositCents > 0 ? (depositCents / 100).toFixed(2) : ""}
                  onChange={(e) =>
                    setDepositCents(
                      Math.round(parseFloat(e.target.value || "0") * 100)
                    )
                  }
                  placeholder="80.00"
                  className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
                />
              </Field>
              <Field label="Installments">
                <input
                  type="number"
                  min={1}
                  value={installmentCount}
                  onChange={(e) =>
                    setInstallmentCount(parseInt(e.target.value || "3", 10))
                  }
                  className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
                />
              </Field>
              <Field label="First installment">
                <input
                  type="date"
                  value={firstInstallmentAt}
                  onChange={(e) => setFirstInstallmentAt(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
                />
              </Field>
            </div>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-4 py-3">
          <span className="text-[13px] font-medium text-fg">Total</span>
          <span className="font-mono text-[16px] font-semibold tabular-nums text-fg">
            ${(subtotalCents / 100).toFixed(2)}
          </span>
        </div>

        {error && (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>

      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="ghost" onClick={() => submit(true)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as draft"}
        </Button>
        <Button onClick={() => submit(false)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & send"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Field({
  label,
  required,
  hint,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </p>
      {children}
      {hint && <p className="text-[11px] text-fg-muted">{hint}</p>}
    </div>
  );
}

function fullName(p: Person) {
  return (
    p.preferredName ??
    [p.legalFirstName, p.legalLastName].filter(Boolean).join(" ") ??
    "—"
  );
}

function initialsFor(p: Person) {
  const f = p.legalFirstName?.[0] ?? "";
  const l = p.legalLastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}
