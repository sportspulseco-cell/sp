import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError, PageHeader } from "@sportspulse/ui";
import Link from "next/link";
import { GenerateForm } from "@/components/scheduling/generate-form";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { openInActiveOrg } from "@/lib/active-org";

export const metadata = { title: "Generate schedule · Org Admin" };
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

  const scope = await loadMeScope();
  await openInActiveOrg(scope, season.orgId, `/scheduling/${seasonId}/generate`);

  const divisionsResult = await load(fetchAll(cursor => leagueMgmt.listDivisions({ seasonId: season.id, limit: 100, cursor })));
  if (!divisionsResult.ok) return <LoadError what="this season's divisions" status={divisionsResult.status} message={divisionsResult.message} />;
  const divisionsPage = divisionsResult.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Generate · ${season.name}`}
        description="Create a draft for this division. Published games stay in place. Review the result before publishing."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <GenerateForm
        key={season.id}
        seasonId={season.id}
        orgId={season.orgId}
        seasonName={season.name}
        divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
        timezone={season.timezone ?? "UTC"}
      />
    </div>
  );
}
