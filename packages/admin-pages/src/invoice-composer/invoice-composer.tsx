"use client";

/**
 * Shared InvoiceComposer used by both sa-web and org-admin-web.
 *
 * Transport-agnostic: the consuming app injects `createBulkInvoice`
 * (their own browser-api SDK) plus the picker data (orgs, leagues,
 * seasons, divisions, teams, persons). On success the composer calls
 * `onSuccess(result)` — each app routes back to its own /finance page.
 *
 * Same callback pattern as OrgSetupWizard (commit b99de22) and
 * CreateFormButton (commit 4eef81a). Cardinal rule: one source of
 * truth for invoice creation; never a sa-only form and an org-admin
 * form drifting apart.
 */

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, Input, Select } from "@sportspulse/ui";

export type BillingScope =
  | "individual"
  | "team"
  | "division"
  | "league"
  | "season"
  | "org";

export interface InvoiceComposerPerson {
  id: string;
  displayName: string;
  orgId: string;
}
export interface InvoiceComposerOrg {
  id: string;
  displayName: string;
}
export interface InvoiceComposerLeague {
  id: string;
  name: string;
  orgId: string;
}
export interface InvoiceComposerSeason {
  id: string;
  name: string;
  orgId: string;
}
export interface InvoiceComposerDivision {
  id: string;
  name: string;
  orgId: string;
}
export interface InvoiceComposerTeam {
  id: string;
  name: string;
  orgId: string;
}

export type InvoiceItemKind =
  | "registration_fee"
  | "jersey"
  | "equipment"
  | "late_fee"
  | "discount"
  | "other";

export interface InvoiceComposerBody {
  orgId: string;
  billingScope: BillingScope;
  targetId: string;
  invoiceType?: string;
  items: Array<{
    kind: InvoiceItemKind;
    description: string;
    quantity?: number;
    unitAmountCents: number;
  }>;
  dueAt: string;
  notes?: string | null;
}

export interface InvoiceComposerResult {
  invoices: Array<{ id: string }>;
  bulkJobId: string | null;
  count: number;
  idempotent?: boolean;
}

export interface InvoiceComposerProps {
  /** Orgs to choose from. Single-element array = locked picker. */
  orgs: InvoiceComposerOrg[];
  persons?: InvoiceComposerPerson[];
  teams?: InvoiceComposerTeam[];
  divisions?: InvoiceComposerDivision[];
  leagues?: InvoiceComposerLeague[];
  seasons?: InvoiceComposerSeason[];
  /** Initial org selection (defaults to orgs[0]?.id). */
  defaultOrgId?: string;
  createBulkInvoice: (
    body: InvoiceComposerBody,
    idempotencyKey: string
  ) => Promise<InvoiceComposerResult>;
  onSuccess: (result: InvoiceComposerResult) => void;
  /** Optional Cancel target — typically `() => router.back()`. */
  onCancel?: () => void;
}

const ITEM_KINDS: Array<{ value: InvoiceItemKind; label: string }> = [
  { value: "registration_fee", label: "Registration fee" },
  { value: "jersey", label: "Jersey" },
  { value: "equipment", label: "Equipment" },
  { value: "late_fee", label: "Late fee" },
  { value: "discount", label: "Discount" },
  { value: "other", label: "Other" }
];

const SCOPE_OPTIONS: Array<{ value: BillingScope; label: string; hint: string }> = [
  { value: "individual", label: "Individual", hint: "Bill one person." },
  { value: "team", label: "Team", hint: "Fan out to every active member of a team." },
  { value: "division", label: "Division", hint: "Every active member of every confirmed team in the division." },
  { value: "league", label: "League", hint: "Every active member of every confirmed team across the league." },
  { value: "season", label: "Season", hint: "Every active member of every confirmed team across the season." },
  { value: "org", label: "Org-wide", hint: "Every active member of every team in the org." }
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function genIdempotencyKey(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InvoiceComposer(props: InvoiceComposerProps) {
  const today = todayIso();
  const [orgId, setOrgId] = useState<string>(
    props.defaultOrgId ?? props.orgs[0]?.id ?? ""
  );
  const [billingScope, setBillingScope] = useState<BillingScope>("individual");
  const [targetId, setTargetId] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<
    Array<{
      kind: InvoiceItemKind;
      description: string;
      quantity: number;
      unitDollars: string;
    }>
  >([
    {
      kind: "registration_fee",
      description: "",
      quantity: 1,
      unitDollars: ""
    }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter target picker by the selected org (so an admin with multi-org
  // access can't accidentally bill an entity from a different org). For
  // the org-wide scope the target *is* the org.
  const targets = useMemo(() => {
    if (billingScope === "org") {
      return props.orgs
        .filter((o) => o.id === orgId)
        .map((o) => ({ id: o.id, label: o.displayName }));
    }
    if (billingScope === "individual")
      return (props.persons ?? [])
        .filter((p) => p.orgId === orgId)
        .map((p) => ({ id: p.id, label: p.displayName }));
    if (billingScope === "team")
      return (props.teams ?? [])
        .filter((t) => t.orgId === orgId)
        .map((t) => ({ id: t.id, label: t.name }));
    if (billingScope === "division")
      return (props.divisions ?? [])
        .filter((d) => d.orgId === orgId)
        .map((d) => ({ id: d.id, label: d.name }));
    if (billingScope === "league")
      return (props.leagues ?? [])
        .filter((l) => l.orgId === orgId)
        .map((l) => ({ id: l.id, label: l.name }));
    if (billingScope === "season")
      return (props.seasons ?? [])
        .filter((s) => s.orgId === orgId)
        .map((s) => ({ id: s.id, label: s.name }));
    return [];
  }, [
    billingScope,
    orgId,
    props.persons,
    props.teams,
    props.divisions,
    props.leagues,
    props.seasons,
    props.orgs
  ]);

  const totalCents = items.reduce((sum, it) => {
    const unit = Math.round(Number(it.unitDollars) * 100) || 0;
    return sum + unit * (it.quantity || 1);
  }, 0);
  const totalDisplay = (totalCents / 100).toFixed(2);

  const valid =
    !!orgId &&
    !!billingScope &&
    !!targetId &&
    !!dueAt &&
    dueAt >= today &&
    items.length > 0 &&
    items.every(
      (it) =>
        it.description.trim().length > 0 &&
        Number(it.unitDollars) > 0 &&
        it.quantity > 0
    );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: InvoiceComposerBody = {
        orgId,
        billingScope,
        targetId,
        invoiceType: "manual",
        items: items.map((it) => ({
          kind: it.kind,
          description: it.description.trim(),
          quantity: it.quantity,
          unitAmountCents: Math.round(Number(it.unitDollars) * 100)
        })),
        dueAt,
        notes: notes.trim() ? notes.trim() : null
      };
      const result = await props.createBulkInvoice(
        body,
        genIdempotencyKey()
      );
      props.onSuccess(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // who pays
          </p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
            Pick the billing target
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {props.orgs.length > 1 ? (
            <Field label="Organisation" htmlFor="org">
              <Select
                id="org"
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setTargetId("");
                }}
                required
              >
                {props.orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field
            label="Billing scope"
            htmlFor="scope"
            hint={
              SCOPE_OPTIONS.find((o) => o.value === billingScope)?.hint
            }
          >
            <Select
              id="scope"
              value={billingScope}
              onChange={(e) => {
                setBillingScope(e.target.value as BillingScope);
                setTargetId("");
              }}
              required
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label={
            billingScope === "individual"
              ? "Person *"
              : billingScope === "team"
                ? "Team *"
                : billingScope === "division"
                  ? "Division *"
                  : billingScope === "league"
                    ? "League *"
                    : billingScope === "season"
                      ? "Season *"
                      : "Org *"
          }
          htmlFor="target"
          hint={
            targets.length === 0
              ? billingScope === "individual"
                ? "No people loaded yet for this org. A person shows up here once they hold an active membership, registration, or role assignment in your org."
                : `No ${billingScope}s exist for this org yet — pick another scope or seed the data first.`
              : undefined
          }
        >
          <Select
            id="target"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            required
            disabled={targets.length === 0}
          >
            <option value="">
              {targets.length === 0
                ? "—"
                : `Pick a ${billingScope === "individual" ? "person" : billingScope}…`}
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // line items
            </p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
              What are they being billed for?
            </h2>
          </div>
          <button
            type="button"
            onClick={() =>
              setItems((xs) => [
                ...xs,
                {
                  kind: "other",
                  description: "",
                  quantity: 1,
                  unitDollars: ""
                }
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2.5 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add line
          </button>
        </div>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-12 items-end gap-2 rounded-md border border-border bg-bg-subtle p-3"
            >
              <div className="col-span-12 sm:col-span-3">
                <Field label="Kind">
                  <Select
                    value={it.kind}
                    onChange={(e) =>
                      setItems((xs) =>
                        xs.map((row, idx) =>
                          idx === i
                            ? { ...row, kind: e.target.value as InvoiceItemKind }
                            : row
                        )
                      )
                    }
                  >
                    {ITEM_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Field label="Description *">
                  <Input
                    value={it.description}
                    onChange={(e) =>
                      setItems((xs) =>
                        xs.map((row, idx) =>
                          idx === i
                            ? { ...row, description: e.target.value }
                            : row
                        )
                      )
                    }
                    placeholder="e.g. 2026 Spring season registration"
                    required
                  />
                </Field>
              </div>
              <div className="col-span-4 sm:col-span-1">
                <Field label="Qty">
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) =>
                      setItems((xs) =>
                        xs.map((row, idx) =>
                          idx === i
                            ? { ...row, quantity: Number(e.target.value) }
                            : row
                        )
                      )
                    }
                    required
                  />
                </Field>
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Field label="Unit (USD)">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.unitDollars}
                    onChange={(e) =>
                      setItems((xs) =>
                        xs.map((row, idx) =>
                          idx === i
                            ? { ...row, unitDollars: e.target.value }
                            : row
                        )
                      )
                    }
                    placeholder="0.00"
                    required
                  />
                </Field>
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setItems((xs) => xs.filter((_, idx) => idx !== i))
                  }
                  disabled={items.length === 1}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-1 px-2 text-fg-muted transition-colors hover:border-[var(--tint-rose-fg)]/40 hover:text-[var(--tint-rose-fg)] disabled:opacity-40"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-[13px]">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Subtotal
          </span>
          <span className="font-mono tabular-nums text-fg">
            ${totalDisplay}
          </span>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // terms
          </p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
            When is it due?
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date *" hint="No past dates — pick today or later.">
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              min={today}
              required
            />
          </Field>
          <Field label="Notes" hint="Optional — surfaces on the invoice.">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Includes jersey — please send size by 04/15."
            />
          </Field>
        </div>
      </section>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex items-center justify-end gap-3">
        {props.onCancel ? (
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={!valid || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
            </>
          ) : (
            "Create invoice"
          )}
        </Button>
      </div>
    </form>
  );
}
