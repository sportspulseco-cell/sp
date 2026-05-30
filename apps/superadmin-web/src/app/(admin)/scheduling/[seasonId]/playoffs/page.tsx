import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingPlayoffBrackets } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Playoffs — SportsPulse" };
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
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  const divisionsPage = await leagueMgmt
    .listDivisions({ seasonId: season.id })
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
      <SchedulingPlayoffBrackets
        seasonId={season.id}
        divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
