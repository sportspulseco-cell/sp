import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Download,
  FileWarning,
  Link2,
  RefreshCcw,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { finance, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status-badge";
import { formatMoney } from "@/components/finance/money";
import type { Invoice } from "@/lib/api/types";

export const metadata = { title: "AR Dashboard — SportsPulse" };

// Aging buckets in days. Industry-standard receivables binning —
// "current" means not yet due (or due today); the rest are days
// past due. Mirrored in the bucket labels + KPI tiles.
const BUCKETS: Array<{
  key: "current" | "1_30" | "31_60" | "61_90" | "90_plus";
  label: string;
  hint: string;
  /** Inclusive lower bound, in days past due. -Infinity for `current`. */
  fromDays: number;
  /** Inclusive upper bound, in days past due. Infinity for `90_plus`. */
  toDays: number;
  tint: Tint;
}> = [
  { key: "current", label: "Current", hint: "Not yet due", fromDays: -Infinity, toDays: 0, tint: "blue" },
  { key: "1_30", label: "1–30 days", hint: "Just past due", fromDays: 1, toDays: 30, tint: "amber" },
  { key: "31_60", label: "31–60 days", hint: "Needs attention", fromDays: 31, toDays: 60, tint: "amber" },
  { key: "61_90", label: "61–90 days", hint: "At risk", fromDays: 61, toDays: 90, tint: "rose" },
  { key: "90_plus", label: "90+ days", hint: "Likely bad debt", fromDays: 91, toDays: Infinity, tint: "rose" }
];

type BucketKey = (typeof BUCKETS)[number]["key"];

function daysPastDue(invoice: Invoice, now: Date): number {
  if (!invoice.dueAt) return 0;
  const due = new Date(invoice.dueAt).getTime();
  return Math.floor((now.getTime() - due) / (1000 * 60 * 60 * 24));
}

function bucketFor(invoice: Invoice, now: Date): BucketKey {
  const d = daysPastDue(invoice, now);
  for (const b of BUCKETS) if (d >= b.fromDays && d <= b.toDays) return b.key;
  return "current";
}

function outstandingCents(invoice: Invoice): number {
  if (invoice.status === "void") return 0;
  return Math.max(0, invoice.totalCents - invoice.paidCents);
}

export default async function ARDashboardPage() {
  const now = new Date();
  const [invoicesPage, orgList] = await Promise.all([
    // Pull the largest sensible page — AR aging is a whole-population
    // calculation; cursor-paginating would distort the bucket totals.
    finance
      .listInvoices({ limit: 200 })
      .catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  // -------- Aging by bucket --------
  const openInvoices = invoicesPage.items.filter(
    (i) => outstandingCents(i) > 0 && i.status !== "void"
  );

  const bucketTotals: Record<BucketKey, { cents: number; count: number }> = {
    current: { cents: 0, count: 0 },
    "1_30": { cents: 0, count: 0 },
    "31_60": { cents: 0, count: 0 },
    "61_90": { cents: 0, count: 0 },
    "90_plus": { cents: 0, count: 0 }
  };
  for (const inv of openInvoices) {
    const k = bucketFor(inv, now);
    bucketTotals[k].cents += outstandingCents(inv);
    bucketTotals[k].count += 1;
  }

  // Pick the dominant currency for display. AR is typically single-
  // currency per org so this is a reasonable simplification.
  const currency = openInvoices[0]?.currency ?? "USD";
  const totalOutstandingCents = openInvoices.reduce(
    (a, i) => a + outstandingCents(i),
    0
  );

  // -------- Per-recipient grouping --------
  type RecipientRow = {
    key: string;
    label: string;
    orgId: string;
    invoiceCount: number;
    outstandingCents: number;
    oldestDays: number;
    worstStatus: Invoice["status"];
  };
  const recipients = new Map<string, RecipientRow>();
  for (const inv of openInvoices) {
    const key =
      inv.recipientPersonId ?? inv.recipientEmail ?? "unknown:" + inv.id;
    const label =
      inv.recipientPersonId
        ? `Person ${inv.recipientPersonId.slice(0, 8)}`
        : (inv.recipientEmail ?? "Unknown recipient");
    const acc = recipients.get(key) ?? {
      key,
      label,
      orgId: inv.orgId,
      invoiceCount: 0,
      outstandingCents: 0,
      oldestDays: -Infinity,
      worstStatus: "draft" as Invoice["status"]
    };
    acc.invoiceCount += 1;
    acc.outstandingCents += outstandingCents(inv);
    const dpd = daysPastDue(inv, now);
    if (dpd > acc.oldestDays) acc.oldestDays = dpd;
    if (inv.status === "overdue") acc.worstStatus = "overdue";
    else if (acc.worstStatus !== "overdue" && inv.status === "partial")
      acc.worstStatus = "partial";
    else if (acc.worstStatus === "draft") acc.worstStatus = inv.status;
    recipients.set(key, acc);
  }
  const recipientRows = [...recipients.values()].sort(
    (a, b) => b.outstandingCents - a.outstandingCents
  );

  // -------- Render --------
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="accounts receivable"
        title="AR Dashboard"
        description="Outstanding receivables binned by age. Aged buckets, top debtors, and the integration surface for refunds, credits, wallets, and QuickBooks sync."
        action={
          <Link
            href="/finance"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back to Finance
          </Link>
        }
      />

      {/* Top-line outstanding */}
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Total outstanding</Eyebrow>
            <p className="mt-3 font-mono text-[36px] font-semibold tabular-nums tracking-tight text-fg">
              {formatMoney(totalOutstandingCents, currency)}
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              Across {openInvoices.length}{" "}
              {openInvoices.length === 1 ? "invoice" : "invoices"} from{" "}
              {recipientRows.length}{" "}
              {recipientRows.length === 1 ? "recipient" : "recipients"}
            </p>
          </div>
          <ExportButton />
        </div>
      </section>

      {/* Aging buckets */}
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {BUCKETS.map((b) => {
          const total = bucketTotals[b.key];
          const pct =
            totalOutstandingCents > 0
              ? Math.round((total.cents / totalOutstandingCents) * 100)
              : 0;
          return (
            <div
              key={b.key}
              className="rounded-xl border border-border bg-surface-1 p-5"
            >
              <div className="flex items-center justify-between">
                <Eyebrow>{b.label}</Eyebrow>
                <IconTile
                  icon={b.key === "current" ? Clock : AlertCircle}
                  tint={b.tint}
                  size="sm"
                />
              </div>
              <p className="mt-5 font-mono text-[24px] font-semibold tabular-nums tracking-tight text-fg">
                {formatMoney(total.cents, currency)}
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">
                {total.count}{" "}
                {total.count === 1 ? "invoice" : "invoices"} · {pct}% of AR
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                {b.hint}
              </p>
            </div>
          );
        })}
      </section>

      {/* Per-recipient AR */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Top debtors</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Recipients with open balances, ranked by outstanding amount.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {recipientRows.length} active
          </span>
        </header>
        {recipientRows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Zero AR"
            description="No outstanding invoices — every issued invoice has been paid in full or voided."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Recipient</TH>
                <TH>Org</TH>
                <TH className="text-right">Invoices</TH>
                <TH className="text-right">Outstanding</TH>
                <TH className="text-right">Oldest (days past due)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {recipientRows.slice(0, 50).map((r) => (
                <TR key={r.key}>
                  <TD className="font-medium text-fg">{r.label}</TD>
                  <TD className="text-fg-muted">
                    {orgMap.get(r.orgId) ?? r.orgId.slice(0, 8)}
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-fg-muted">
                    {r.invoiceCount}
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-fg">
                    {formatMoney(r.outstandingCents, currency)}
                  </TD>
                  <TD
                    className={
                      "text-right font-mono tabular-nums " +
                      (r.oldestDays >= 90
                        ? "text-rose-600 dark:text-rose-400"
                        : r.oldestDays >= 31
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-fg-muted")
                    }
                  >
                    {r.oldestDays > 0 ? r.oldestDays : 0}
                  </TD>
                  <TD>
                    <InvoiceStatusBadge status={r.worstStatus} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Integration surfaces — placeholder cards. The DB schema for
          refunds / credits / wallets / QB sync is not landed yet, so
          these read-only cards stake out the UI footprint without
          pretending to ship functionality. */}
      <section className="space-y-3">
        <Eyebrow>Integration surface</Eyebrow>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PlannedCard
            icon={RefreshCcw}
            title="Refunds"
            description="Issue full or partial refunds against any payment. Refund records will append to the payment ledger and reverse invoice paidCents."
            tint="amber"
          />
          <PlannedCard
            icon={CreditCard}
            title="Credits"
            description="Issue credit memos that offset an existing or future invoice. Credit ledger per recipient, applied at payment time."
            tint="blue"
          />
          <PlannedCard
            icon={Banknote}
            title="Wallet"
            description="Per-person prepaid balance. Used for prepays, season carry-overs, and refund destinations when card-of-record isn't on file."
            tint="emerald"
          />
          <PlannedCard
            icon={Link2}
            title="QuickBooks sync"
            description="Push invoices + payments to QuickBooks Online; pull paid status back. Per-org connection, status reflected on each invoice row."
            tint="rose"
          />
        </div>
      </section>
    </div>
  );
}

function ExportButton() {
  return (
    <button
      type="button"
      disabled
      title="CSV export — coming soon"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted opacity-60"
    >
      <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
      Export CSV
    </button>
  );
}

function PlannedCard({
  icon: Icon,
  title,
  description,
  tint
}: {
  icon: typeof FileWarning;
  title: string;
  description: string;
  tint: Tint;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-dashed border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <IconTile icon={Icon} tint={tint} size="sm" />
        <Badge mono tone="warning">
          PLANNED
        </Badge>
      </div>
      <p className="mt-4 text-[15px] font-semibold tracking-tight text-fg">
        {title}
      </p>
      <p className="mt-1 flex-1 text-[12px] leading-relaxed text-fg-muted">
        {description}
      </p>
      <span className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <CircleDollarSign className="h-3 w-3" strokeWidth={1.75} />
        Module reserved
        <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
      </span>
    </div>
  );
}
