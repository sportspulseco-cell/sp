import Link from "next/link";
import { CircleDollarSign, Star } from "lucide-react";
import { EmptyState, Eyebrow } from "@sportspulse/ui";
import { captain, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Dues — SportsPulse" };

/**
 * Workflow 7C §6.7 — captain Dues tab.
 *
 * Lightweight stand-in for the Workflow 4 dues tracker component.
 * Surfaces the same collection progress the dashboard mini-card
 * shows but in a dedicated full-page view.
 */
export default async function CaptainDuesPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const myTeamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !myTeamId) {
    return (
      <EmptyState
        icon={Star}
        title="Captain role required"
        description="Ask your league admin to assign captain to your account."
      />
    );
  }

  const state = await captain.dashboardState(myTeamId).catch(() => null);

  const collected = state?.collectedCents ?? 0;
  const threshold = state?.thresholdCents ?? 0;
  const pct = threshold ? Math.min(100, Math.round((collected / threshold) * 100)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Team dues"
        description="Collection progress against the confirmation threshold for the current season."
      />

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <Eyebrow>// collection progress</Eyebrow>
        <div className="mt-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular-nums text-fg">
              {fmt(collected)}
            </span>
            <span className="font-mono text-[12px] uppercase tracking-widest text-fg-muted">
              of {fmt(threshold)} ({pct}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-subtle">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[12px] text-fg-muted">
            {threshold === 0
              ? "No collection threshold configured for this season — every confirmed team enters with $0 due."
              : "Once the threshold is reached the team flips to `confirmed` automatically."}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-border bg-bg-subtle p-5">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-fg-muted" />
          <p className="text-[14px] text-fg">Per-player sub-invoice timeline</p>
        </div>
        <p className="mt-1 text-[12px] text-fg-muted">
          The Workflow 4 captain dues tracker drops in here. For now, see the{" "}
          <Link href="/captain/invites" className="text-accent hover:underline">
            Invites page
          </Link>{" "}
          for which players have / haven't paid their deposit.
        </p>
      </section>
    </div>
  );
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
