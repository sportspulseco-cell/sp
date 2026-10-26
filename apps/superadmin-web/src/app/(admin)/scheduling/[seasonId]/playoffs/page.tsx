import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError, PageHeader } from "@sportspulse/ui";
import Link from "next/link";
import { ScheduleTimeZoneProvider } from "@sportspulse/admin-pages";
import { PlayoffBrackets } from "@/components/scheduling/playoff-brackets";
import { leagueMgmt } from "@/lib/api/server-api";

export const metadata = { title: "Playoffs · Super Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #3 — playoff brackets.
 *
 * Reserve playoff ice up-front via ice_slots.is_playoff_reservation,
 * generate the bracket from current standings, advance winners as
 * results come in. Single-elim with top 4 / 8 / 16 in v1.
 */
export default async function PlayoffsPage({
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

  const divisionsPage = await fetchAll((cursor) => leagueMgmt
    .listDivisions({ seasonId: season.id, limit: 100, cursor }))
    .catch(() => ({ items: [] as { id: string; name: string }[] }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Playoffs · ${season.name}`}
        description="Seeded single-elim brackets backed by ice_slots.is_playoff_reservation. Round 1 is created at generation; later rounds materialise as winners are advanced."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <ScheduleTimeZoneProvider timeZone={season.timezone}>
        <PlayoffBrackets
          seasonId={season.id}
          divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
        />
      </ScheduleTimeZoneProvider>
    </div>
  );
}
