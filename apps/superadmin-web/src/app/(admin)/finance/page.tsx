import {
  AlertCircle,
  ArrowUpRight,
  CircleDollarSign,
  Clock,
  Receipt,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { finance, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { StatNumber } from "@/components/ui/stat-number";
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
import { CreateFeeScheduleButton } from "@/components/finance/create-fee-schedule-button";
import type { InvoiceStatus } from "@/lib/api/types";

export const metadata = { title: "Finance — SportsPulse" };

const STATUS_FILTERS: Array<{ key: InvoiceStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "void", label: "Void" }
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

export default async function FinancePage({
  searchParams
}: {
  searchParams?: Promise<{ status?: InvoiceStatus }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;

  const [filteredPage, allPage, schedulesPage, orgList] = await Promise.all([
    finance
      .listInvoices({ status, limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    status
      ? finance
          .listInvoices({ limit: 200 })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve(null),
    finance
      .listFeeSchedules({ limit: 50 })
      .catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const allInvoices = (allPage ?? filteredPage).items;
  const totalsByCurrency = new Map<
    string,
    { outstandingCents: number; paidCents: number; overdueCents: number }
  >();
  for (const inv of allInvoices) {
    const k = inv.currency || "USD";
    const acc = totalsByCurrency.get(k) ?? {
      outstandingCents: 0,
      paidCents: 0,
      overdueCents: 0
    };
    if (inv.status !== "void") {
      acc.outstandingCents += Math.max(0, inv.totalCents - inv.paidCents);
      acc.paidCents += inv.paidCents;
      if (inv.status === "overdue") acc.overdueCents += inv.totalCents - inv.paidCents;
    }
    totalsByCurrency.set(k, acc);
  }
  const primary = totalsByCurrency.entries().next().value as
    | [string, { outstandingCents: number; paidCents: number; overdueCents: number }]
    | undefined;
  const [primaryCurrency, primaryTotals] = primary ?? [
    "USD",
    { outstandingCents: 0, paidCents: 0, overdueCents: 0 }
  ];

  const counts = {
    draft: allInvoices.filter((i) => i.status === "draft").length,
    sent: allInvoices.filter((i) => i.status === "sent").length,
    partial: allInvoices.filter((i) => i.status === "partial").length,
    paid: allInvoices.filter((i) => i.status === "paid").length,
    overdue: allInvoices.filter((i) => i.status === "overdue").length
  };

  const KPIs: Array<{
    label: string;
    value: string;
    hint: string;
    icon: typeof CircleDollarSign;
    tint: Tint;
  }> = [
    {
      label: "Outstanding",
      value: formatMoney(primaryTotals.outstandingCents, primaryCurrency),
      hint: `${counts.sent + counts.partial} active invoices`,
      icon: Wallet,
      tint: "blue"
    },
    {
      label: "Collected",
      value: formatMoney(primaryTotals.paidCents, primaryCurrency),
      hint: `${counts.paid} paid in full`,
      icon: CircleDollarSign,
      tint: "emerald"
    },
    {
      label: "Overdue",
      value: formatMoney(primaryTotals.overdueCents, primaryCurrency),
      hint: `${counts.overdue} past due`,
      icon: AlertCircle,
      tint: "rose"
    },
    {
      label: "Drafts",
      value: String(counts.draft),
      hint: "Not yet sent",
      icon: Clock,
      tint: "amber"
    }
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="OPERATIONS"
        title="Finance"
        description="Outstanding revenue, paid invoices, fee schedules. Approving a registration spawns an invoice; payments are recorded manually for now."
        action={
          <Link
            href="/finance/ar"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            AR Dashboard
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        }
      />

      {/* KPI tiles */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {KPIs.map(({ label, value, hint, icon: Icon, tint }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-surface-1 p-5"
          >
            <div className="flex items-center justify-between">
              <Eyebrow>{label}</Eyebrow>
              <IconTile icon={Icon} tint={tint} size="sm" />
            </div>
            <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
              {value}
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">{hint}</p>
          </div>
        ))}
      </section>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "all") === f.key;
          const href = f.key === "all" ? "/finance" : `/finance?status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={
                active
                  ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                  : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Invoices table */}
      {filteredPage.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices"
          description={
            status
              ? `Nothing in the ${status} bucket.`
              : "Approve a registration to spawn the first invoice, or create one manually."
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Number</TH>
              <TH>Org</TH>
              <TH>Recipient</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Paid</TH>
              <TH>Status</TH>
              <TH>Due</TH>
            </TR>
          </THead>
          <TBody>
            {filteredPage.items.map((inv) => (
              <TR key={inv.id}>
                <TD className="font-mono text-[12px] font-medium text-fg">
                  <Link
                    href={`/finance/${inv.id}`}
                    className="hover:underline"
                  >
                    {inv.invoiceNumber}
                  </Link>
                </TD>
                <TD className="text-fg-muted">
                  {orgMap.get(inv.orgId) ?? inv.orgId.slice(0, 8)}
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {inv.recipientPersonId
                    ? inv.recipientPersonId.slice(0, 8)
                    : (inv.recipientEmail ?? "—")}
                </TD>
                <TD className="text-right font-mono tabular-nums text-fg">
                  {formatMoney(inv.totalCents, inv.currency)}
                </TD>
                <TD
                  className={
                    "text-right font-mono tabular-nums " +
                    (inv.paidCents >= inv.totalCents
                      ? "text-emerald-600 dark:text-emerald-400"
                      : inv.paidCents > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-fg-muted")
                  }
                >
                  {formatMoney(inv.paidCents, inv.currency)}
                </TD>
                <TD>
                  <InvoiceStatusBadge status={inv.status} />
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {fmtDate(inv.dueAt)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Fee schedules quick-look */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Fee schedules</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Reusable price templates per (org, scope). Used to spawn invoices
              automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              {schedulesPage.items.length} active
            </span>
            <CreateFeeScheduleButton orgs={orgList.items} />
          </div>
        </header>
        {schedulesPage.items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-fg-muted">
            No fee schedules yet — invoices spawn at $0 until one's defined.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {schedulesPage.items.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {s.name}
                    {s.code ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                        {s.code}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {s.kind} ·{" "}
                    {orgMap.get(s.orgId) ?? s.orgId.slice(0, 8)} ·{" "}
                    due in {s.dueOffsetDays}d
                  </p>
                </div>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-fg">
                  {formatMoney(s.baseAmountCents, s.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
