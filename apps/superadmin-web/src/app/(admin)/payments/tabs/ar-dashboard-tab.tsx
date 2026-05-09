import Link from "next/link";
import { ArrowRight, ScrollText } from "lucide-react";
import { Badge, EmptyState } from "@sportspulse/ui";
import type { Invoice } from "@sportspulse/api-client";
import { finance } from "@/lib/api/server-api";
import { fmtMoney, fmtDate, daysPastDue } from "../lib/format";

const AGING_BUCKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: "current", label: "Current", min: 0, max: 0 },
  { key: "1_30", label: "1–30 days", min: 1, max: 30 },
  { key: "31_60", label: "31–60 days", min: 31, max: 60 },
  { key: "61_90", label: "61–90 days", min: 61, max: 90 },
  { key: "90_plus", label: "90+ days", min: 91, max: Number.POSITIVE_INFINITY }
];

/**
 * AR dashboard — KPIs (outstanding, collected, overdue, draft) +
 * aging buckets + a recent-invoices table that links into the
 * Player invoice tab. Uses only the existing finance.listInvoices
 * endpoint; the new finance-extension tables aren't required here.
 */
export async function ArDashboardTab({ orgId }: { orgId: string }) {
  const [openPage, paidPage] = await Promise.all([
    finance
      .listInvoices({ orgId, limit: 100 })
      .catch(() => ({ items: [] as Invoice[], nextCursor: null })),
    finance
      .listInvoices({ orgId, status: "paid", limit: 50 })
      .catch(() => ({ items: [] as Invoice[], nextCursor: null }))
  ]);

  const all = [...openPage.items, ...paidPage.items];
  const outstanding = all.reduce((sum, i) => sum + (i.totalCents - i.paidCents), 0);
  const collected = all.reduce((sum, i) => sum + i.paidCents, 0);
  const overdueCount = all.filter((i) => i.status === "overdue").length;
  const draftCount = all.filter((i) => i.status === "draft").length;
  const currency = all[0]?.currency ?? "USD";

  // Bucket the outstanding pipeline by days-past-due.
  const buckets = AGING_BUCKETS.map((b) => {
    const matching = all.filter((i) => {
      if (i.status === "paid" || i.status === "void") return false;
      const dpd = daysPastDue(i.dueAt);
      if (b.key === "current") return dpd === 0;
      return dpd >= b.min && dpd <= b.max;
    });
    const amount = matching.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
    return { ...b, count: matching.length, amount };
  });

  const recent = all
    .filter((i) => i.status !== "void")
    .sort((a, b) => (b.issuedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.createdAt))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Outstanding" value={fmtMoney(outstanding, currency)} tone="warning" />
        <Kpi label="Collected" value={fmtMoney(collected, currency)} tone="success" />
        <Kpi label="Overdue" value={String(overdueCount)} sublabel="invoices" tone="danger" />
        <Kpi label="Drafts" value={String(draftCount)} sublabel="not yet sent" />
      </div>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
          <p className="text-[14px] font-semibold tracking-tight text-fg">Aging buckets</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            invoices.dueAt + status
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {buckets.map((b) => (
            <div key={b.key} className="rounded-md border border-border bg-bg-subtle p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {b.label}
              </p>
              <p className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
                {fmtMoney(b.amount, currency)}
              </p>
              <p className="font-mono text-[11px] text-fg-muted">{b.count} invoices</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Recent invoices
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            most recent 12
          </p>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No invoices yet"
            description="Create one from a registration submission, or via the Finance page."
          />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-[12px] text-fg">{i.invoiceNumber}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    Issued {fmtDate(i.issuedAt ?? i.createdAt)}
                    {i.dueAt ? ` · Due ${fmtDate(i.dueAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-[13px] text-fg">
                    {fmtMoney(i.totalCents, i.currency)}
                  </p>
                  <Badge mono tone={statusTone(i.status)}>
                    {i.status}
                  </Badge>
                  <Link
                    href={`/payments?tab=invoice&invoiceId=${i.id}`}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
                  >
                    Open <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sublabel,
  tone
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-300"
          : "text-fg";
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className={`mt-1 text-[24px] font-semibold tracking-tight ${toneClass}`}>
        {value}
      </p>
      {sublabel ? (
        <p className="font-mono text-[11px] text-fg-muted">{sublabel}</p>
      ) : null}
    </div>
  );
}

function statusTone(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "paid") return "success";
  if (status === "partial" || status === "sent") return "warning";
  if (status === "overdue") return "danger";
  if (status === "void") return "neutral";
  return "info";
}
