"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { formatMoney } from "@/components/finance/money";
import { NewInvoiceDialog } from "@/components/finance/new-invoice-dialog";
import type { Org, FeeSchedule } from "@/lib/api/types";

type Summary = {
  totalInvoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  overdueCents: number;
  invoiceCount: number;
  overdueCount: number;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  billingScope: string | null;
  status: string;
  recipientPersonId: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  currency: string;
  dueAt: string | null;
  paidAt: string | null;
  bulkJobId: string | null;
  createdAt: string;
};

type InvoicesPage = { items: InvoiceRow[]; page: number; limit: number };

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" }
];

const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All scopes" },
  { value: "individual", label: "Individual" },
  { value: "team", label: "Team" },
  { value: "division", label: "Division" },
  { value: "league", label: "League" },
  { value: "season", label: "Season" },
  { value: "org", label: "Org" }
];

export function ArDashboardClient({
  summary,
  invoices,
  orgs,
  feeSchedules,
  filters
}: {
  summary: Summary;
  invoices: InvoicesPage;
  orgs: Org[];
  feeSchedules: FeeSchedule[];
  filters: {
    orgId?: string;
    status?: string;
    scope?: string;
    search?: string;
    page: number;
  };
}) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.search ?? "");
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  const currency = invoices.items[0]?.currency ?? "USD";

  function navigate(next: Partial<typeof filters>) {
    const params = new URLSearchParams();
    const merged = { ...filters, ...next };
    if (merged.orgId) params.set("orgId", merged.orgId);
    if (merged.status) params.set("status", merged.status);
    if (merged.scope) params.set("scope", merged.scope);
    if (merged.search) params.set("q", merged.search);
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    router.push(`/finance/ar?${params.toString()}`);
  }

  const hasNext = invoices.items.length === invoices.limit;
  const hasPrev = invoices.page > 1;
  const rangeStart = (invoices.page - 1) * invoices.limit + 1;
  const rangeEnd = rangeStart + invoices.items.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <OrgScopeSelector
            value={filters.orgId ?? ""}
            orgs={orgs}
            onChange={(orgId) => navigate({ orgId, page: 1 })}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNewInvoice(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-fg px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New invoice
        </button>
      </div>

      {/* KPI tiles — mock 1 */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Total invoiced"
          value={formatMoney(summary.totalInvoicedCents, currency)}
          tone="neutral"
        />
        <KpiTile
          label="Collected"
          value={formatMoney(summary.collectedCents, currency)}
          tone="emerald"
        />
        <KpiTile
          label="Outstanding"
          value={formatMoney(summary.outstandingCents, currency)}
          tone="amber"
        />
        <KpiTile
          label="Overdue"
          value={formatMoney(summary.overdueCents, currency)}
          tone="rose"
          hint={`${summary.overdueCount} invoice${summary.overdueCount === 1 ? "" : "s"}`}
        />
      </section>

      {/* Filters row — mock 1 */}
      <section className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: search.trim() || undefined, page: 1 });
          }}
          className="flex flex-1 min-w-[260px] items-center gap-2 rounded-md border border-border bg-bg px-3 py-2"
        >
          <Search className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, invoice #"
            className="flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
        </form>
        <FilterSelect
          value={filters.status ?? ""}
          options={STATUS_OPTIONS}
          onChange={(status) => navigate({ status: status || undefined, page: 1 })}
        />
        <FilterSelect
          value={filters.scope ?? ""}
          options={SCOPE_OPTIONS}
          onChange={(scope) => navigate({ scope: scope || undefined, page: 1 })}
        />
      </section>

      {/* Invoices table — mock 1 */}
      <section className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        {invoices.items.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13px] text-fg-muted">
            No invoices match the current filters.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Invoice #</TH>
                <TH>Recipient</TH>
                <TH>Scope</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Outstanding</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.items.map((i) => (
                <TR key={i.id} className="hover:bg-bg-subtle/40">
                  <TD className="font-mono text-[12px]">
                    <Link
                      href={`/finance/${i.id}`}
                      className="hover:underline"
                    >
                      {i.invoiceNumber}
                    </Link>
                  </TD>
                  <TD>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-fg">
                        {i.recipientName ?? "—"}
                      </p>
                      {i.recipientEmail && (
                        <p className="text-[11px] text-fg-muted">
                          {i.recipientEmail}
                        </p>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <ScopeChip scope={i.billingScope} />
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-fg">
                    {formatMoney(i.totalCents, i.currency)}
                  </TD>
                  <TD
                    className={
                      "text-right font-mono tabular-nums " +
                      (i.outstandingCents > 0
                        ? "text-fg"
                        : "text-fg-muted")
                    }
                  >
                    {formatMoney(i.outstandingCents, i.currency)}
                  </TD>
                  <TD>
                    <StatusBadge status={i.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border bg-bg-subtle/40 px-4 py-3 text-[12px] text-fg-muted">
          <span>
            {invoices.items.length === 0
              ? "0 of 0"
              : `Showing ${rangeStart}–${rangeEnd}`}
            {summary.invoiceCount > 0 && (
              <span> of {summary.invoiceCount} invoices</span>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => navigate({ page: Math.max(1, invoices.page - 1) })}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg px-3 text-[12px] text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Prev
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => navigate({ page: invoices.page + 1 })}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg px-3 text-[12px] text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </section>

      <NewInvoiceDialog
        open={showNewInvoice}
        onClose={() => setShowNewInvoice(false)}
        orgs={orgs}
        feeSchedules={feeSchedules}
        defaultOrgId={filters.orgId}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  hint
}: {
  label: string;
  value: string;
  tone: "neutral" | "emerald" | "amber" | "rose";
  hint?: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "text-fg";
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </p>
      <p className={`mt-2 font-mono text-[22px] font-semibold tabular-nums tracking-tight ${toneClass}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-fg-muted">{hint}</p>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md border border-border bg-bg px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function OrgScopeSelector({
  value,
  orgs,
  onChange
}: {
  value: string;
  orgs: Org[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-bg px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted focus:border-accent focus:outline-none"
    >
      <option value="">All orgs</option>
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.displayName}
        </option>
      ))}
    </select>
  );
}

function ScopeChip({ scope }: { scope: string | null }) {
  if (!scope) return <span className="text-fg-muted">—</span>;
  return (
    <Badge tone="neutral" mono>
      {scope}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: "info" | "success" | "warning" | "danger" | "neutral"; label: string }
  > = {
    draft: { tone: "neutral", label: "draft" },
    sent: { tone: "info", label: "sent" },
    paid: { tone: "success", label: "paid" },
    partial: { tone: "warning", label: "partial" },
    overdue: { tone: "danger", label: "overdue" },
    void: { tone: "neutral", label: "void" }
  };
  const entry = map[status] ?? { tone: "neutral" as const, label: status };
  return (
    <Badge tone={entry.tone} mono>
      {entry.label}
    </Badge>
  );
}
