import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingPlayoffBrackets } from "@sportspulse/admin-pages";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Playoffs — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrgAdminPlayoffsPage({
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

  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && season.orgId !== activeOrgId) notFound();

  const divisionsPage = await fetchAll((cursor) => leagueMgmt
    .listDivisions({ seasonId: season.id, limit: 100, cursor }))
    .catch(() => ({ items: [] as { id: string; name: string }[] }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Playoffs · ${season.name}`}
        description="Seeded single-elim brackets per division."
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
