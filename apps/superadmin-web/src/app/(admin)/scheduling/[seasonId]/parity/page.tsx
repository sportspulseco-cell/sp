import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingParityWindows } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Parity windows — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #6 — 2-week parity window review.
 *
 * Per-team move-up/stay/move-down recommendations derived from
 * standings; admin overrides + applies; backend partial-regens
 * affected divisions while preserving locked + already-played games.
 */
export default async function ParityPage({
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
        title={`Parity · ${season.name}`}
        description="Every parity window for this season. Compute pulls fresh recommendations from current standings; Review lets you accept / override per team; Apply commits the moves and partial-regens affected divisions."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingParityWindows seasonId={season.id} />
    </div>
  );
}
