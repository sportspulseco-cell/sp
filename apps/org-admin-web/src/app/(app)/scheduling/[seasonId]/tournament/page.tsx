import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingTournament } from "@sportspulse/admin-pages";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Tournament — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrgAdminTournamentPage({
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
        description="Dynamic tier mode — top promotes, bottom relegates between rounds."
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
