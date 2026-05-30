import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingVerifyForm } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Verify tiebreaker — SportsPulse" };
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
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  const divisionsPage = await leagueMgmt
    .listDivisions({ seasonId: season.id })
    .catch(() => ({ items: [] as { id: string; name: string }[] }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Verify · ${season.name}`}
        description="Order + toggle tiebreaker rules, then run against the live standings. Any teams flagged as ambiguous mean the ruleset has nothing left to say about them — refine before standings matter."
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
