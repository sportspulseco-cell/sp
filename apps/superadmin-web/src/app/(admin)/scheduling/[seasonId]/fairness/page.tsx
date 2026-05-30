import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingFairnessForm } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Fairness report — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Per-team time-slot fairness (pain #8).
 *
 * Calls scheduler-fairness-report and renders the per-team band table
 * with a tolerance check. Aggregates teams of the active scope; the
 * underlying data is each game's `time_band` (denormalised from the
 * slot at generation time).
 */
export default async function FairnessPage({
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
        title={`Fairness · ${season.name}`}
        description="Per-team time-slot distribution. Highlights teams whose early/mid/late share deviates beyond the configured tolerance, and flags any breach of the late-game cap."
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/scheduling/${season.id}/generate`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              Generate
            </Link>
            <Link
              href={`/seasons/${season.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              ← Season
            </Link>
          </div>
        }
      />
      <SchedulingFairnessForm
        seasonId={season.id}
        divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
