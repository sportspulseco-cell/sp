import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingGenerateForm } from "@sportspulse/admin-pages";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Generate schedule — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Org-admin's Generate page. Mirrors superadmin-web by mounting the
 * shared SchedulingGenerateForm; the only difference is the
 * org-scope check before render (defense-in-depth — Edge Functions
 * already gate at the API layer via `scheduler.run` + season scope).
 */
export default async function OrgAdminSchedulingGeneratePage({
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
        description="Pick a division and run the CP-SAT solver. Locked fixtures (locked_at IS NOT NULL) are preserved; previously-generated games for the same scope are replaced."
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
