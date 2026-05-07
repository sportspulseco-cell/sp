import { ExternalLink, Wallet } from "lucide-react";
import { Eyebrow, IconTile } from "@sportspulse/ui";
import { iam, finance } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance - Org Admin" };

const SUPERADMIN_URL =
  process.env.NEXT_PUBLIC_SUPERADMIN_URL ?? "https://sp-superadmin.vercel.app";

function fmtMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export default async function FinancePage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = scope?.orgIds[0];

  const invoicesPage = orgId
    ? await finance.listInvoices({ orgId, limit: 200 }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const open = invoicesPage.items.filter((i) => i.status !== "void" && i.totalCents > i.paidCents);
  const balanceCents = open.reduce((a, i) => a + (i.totalCents - i.paidCents), 0);
  const overdueCount = invoicesPage.items.filter((i) => i.status === "overdue").length;
  const currency = invoicesPage.items[0]?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Finance"
        title="Finance"
        description="Outstanding receivables for your org. The full AR Dashboard with aging buckets lives in the super-admin console."
        action={
          <a
            href={`${SUPERADMIN_URL}/finance/ar`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            AR Dashboard
            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          </a>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Outstanding</Eyebrow>
            <IconTile icon={Wallet} tint={overdueCount > 0 ? "rose" : "blue"} size="sm" />
          </div>
          <p className="mt-5 font-mono text-[24px] font-semibold tabular-nums tracking-tight text-fg">
            {fmtMoney(balanceCents, currency)}
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">{open.length} open invoice{open.length === 1 ? "" : "s"}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>Total invoices</Eyebrow>
          <p className="mt-5 font-mono text-[24px] font-semibold tabular-nums tracking-tight text-fg">
            {invoicesPage.items.length}
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">across the season to date</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>Overdue</Eyebrow>
          <p className="mt-5 font-mono text-[24px] font-semibold tabular-nums tracking-tight text-fg">
            {overdueCount}
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">need follow-up</p>
        </div>
      </section>
    </div>
  );
}
