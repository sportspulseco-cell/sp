import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError, PageHeader } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingRinkNotifications } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";

export const metadata = { title: "Rink notifications · Super Admin" };
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
  const seasonResult = await load(leagueMgmt.getSeason(seasonId));
  if (!seasonResult.ok) {
    if (seasonResult.status === 404) notFound();
    return (
      <LoadError
        what="this season"
        status={seasonResult.status}
        message={seasonResult.message}
      />
    );
  }
  const season = seasonResult.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Notifications · ${season.name}`}
        description="Messages sent to rinks when games are published or moved. Set up rinks and ice time on the Venues page."
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
