import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError, PageHeader } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingVerifyForm } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";

export const metadata = { title: "Verify tiebreaker · Super Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #5 — tiebreaker ruleset verification.
 *
 * The admin orders + toggles tiebreaker rules, runs verify, and sees
 * (a) static warnings about the ruleset itself, (b) any teams that
 * remained ambiguous in this season's *real* standings (i.e. the rule
 * chain ran out and they fell to the stable teamId fallback).
 *
 * Z3 abstract counter-example proof is intentionally not wired here —
 * see the comment in scheduler-verify's source.
 */
export default async function VerifyPage({
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
        title={`Verify · ${season.name}`}
        description="Order + toggle tiebreaker rules, then run against the live standings. Any teams flagged as ambiguous mean the ruleset has nothing left to say about them. Refine before standings matter."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingVerifyForm
        seasonId={season.id}
        divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
