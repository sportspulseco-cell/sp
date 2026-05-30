import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingTournament } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Tournament — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #4 — dynamic tournament mode (Johnny's ask).
 *
 * Each round teams play a round-robin within their tier (upper / middle /
 * lower). At round end, top promotes and bottom relegates — fixtures for
 * the next round generate automatically against the new tier assignments.
 */
export default async function TournamentPage({
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

  const teamPages = await Promise.all(
    divisionsPage.items.map(async (d) => {
      const page = await leagueMgmt
        .listTeams({ divisionId: d.id })
        .catch(() => ({ items: [] as { id: string; name: string }[] }));
      return page.items.map((t) => ({ id: t.id, name: t.name, divisionId: d.id }));
    })
  );
  const teams = teamPages.flat();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Tournament · ${season.name}`}
        description="Dynamic tier mode. Each round, top of every tier promotes and bottom relegates. Next-round fixtures generate automatically."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingTournament
        seasonId={season.id}
        divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
        teams={teams}
      />
    </div>
  );
}
