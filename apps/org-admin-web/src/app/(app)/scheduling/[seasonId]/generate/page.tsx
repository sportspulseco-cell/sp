import { notFound } from "next/navigation";
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
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && season.orgId !== activeOrgId) notFound();

  const divisionsPage = await leagueMgmt
    .listDivisions({ seasonId: season.id })
    .catch(() => ({ items: [] as { id: string; name: string }[] }));

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
      />
    </div>
  );
}
