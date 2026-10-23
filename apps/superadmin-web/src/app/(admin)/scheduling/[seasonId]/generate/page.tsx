import { fetchAll } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingGenerateForm } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Generate schedule — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Generate-schedule page (pain #9 workflow win).
 *
 * Server-side: validate the season + list its divisions; the form is
 * a client component that calls the Edge Function with the user's JWT.
 *
 * Permission gating lives in the Edge Function itself (scheduler.run);
 * this page is reachable for any signed-in admin and the form will
 * 403 honestly if the user doesn't have permission — no need to
 * pre-check here (would mean two sources of truth for the gate).
 */
export default async function GenerateSchedulePage({
  params
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  const divisionsPage = await fetchAll((cursor) => leagueMgmt
    .listDivisions({ seasonId: season.id, limit: 100, cursor }))
    .catch(() => ({ items: [] as { id: string; name: string }[] }));

  // Team names per division, so results show names instead of ids.
  const teamPages = await Promise.all(
    divisionsPage.items.map((d) =>
      fetchAll((cursor) => leagueMgmt
        .listTeams({ divisionId: d.id, limit: 100, cursor }))
        .catch(() => ({ items: [] as { id: string; name: string }[] }))
    )
  );
  const teamNames = Object.fromEntries(
    teamPages.flatMap((p) => p.items.map((t) => [t.id, t.name] as const))
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Generate · ${season.name}`}
        description={`Pick a division and run the CP-SAT solver. Locked fixtures (locked_at IS NOT NULL) are preserved; previously-generated games for the same scope are replaced.`}
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingGenerateForm
        seasonId={season.id}
        seasonName={season.name}
        divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
        teamNames={teamNames}
      />
    </div>
  );
}
