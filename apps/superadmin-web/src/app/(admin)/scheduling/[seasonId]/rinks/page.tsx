import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingRinkNotifications } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Rink notifications — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #2 — per-venue notification health + outbox.
 *
 * Avario relied on a 3-vendor relay (Avario → Sea Coast → Horizon)
 * that silently failed. SportsPulse delivers directly per venue with
 * a visible outbox + retry. This is the operator's window into that.
 */
export default async function RinksPage({
  params
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Notifications · ${season.name}`}
        description="OUTBOUND webhook delivery + retry tracker. This tab tracks notifications SENT to rink partner systems (SportsEngine, etc.) when games are published or rescheduled. To configure venues, surfaces, and ice slots — the inputs the scheduler reads — use the Venues page."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingRinkNotifications seasonId={season.id} />
    </div>
  );
}
