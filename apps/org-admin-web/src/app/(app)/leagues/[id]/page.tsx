import { notFound } from "next/navigation";
import { LeagueDetail } from "@sportspulse/admin-pages";
import { iam, leagueMgmt, orgs } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";

export const metadata = { title: "League — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Org-admin's read-only league detail. Mirrors sa-web's
 * /leagues/[id]/page.tsx by mounting the same shared component
 * (@sportspulse/admin-pages — LeagueDetail). No role-assignment
 * panel here (sa-only for now); the rest of the body is identical.
 *
 * Reads flow through endpoints already accepting org_admin via
 * AuthorizedAccessGuard — no proxy endpoints needed.
 */
export default async function OrgAdminLeagueDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const league = await leagueMgmt.getLeague(id).catch(() => null);
  if (!league) notFound();

  // Defense in depth — the API already 404s out-of-scope leagues for
  // org_admin reads, but verify the league belongs to the caller's
  // active org before rendering.
  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && league.orgId !== activeOrgId) notFound();

  const [org, governingBodies, seasonsPage] = await Promise.all([
    orgs.get(league.orgId).catch(() => null),
    leagueMgmt.listGoverningBodies({}).catch(() => []),
    leagueMgmt.listSeasons({ leagueId: league.id }).catch(() => ({ items: [] }))
  ]);

  const govBody = governingBodies.find((b) => b.id === league.governingBodyId);

  return (
    <LeagueDetail
      league={league}
      org={org}
      governingBodyName={govBody?.name ?? null}
      seasons={seasonsPage.items}
    />
  );
}
