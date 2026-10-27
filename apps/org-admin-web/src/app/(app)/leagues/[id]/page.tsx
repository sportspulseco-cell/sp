import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { LeagueDetail } from "@sportspulse/admin-pages";
import { LeagueActions } from "@/components/edit/detail-actions";
import { leagueMgmt, loadMeScope, orgs } from "@/lib/api/server-api";
import { openInActiveOrg } from "@/lib/active-org";

export const metadata = { title: "League · Org Admin" };
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
  const leagueResult = await load(leagueMgmt.getLeague(id));
  if (!leagueResult.ok) {
    if (leagueResult.status === 404) notFound();
    return (
      <LoadError
        what="this league"
        status={leagueResult.status}
        message={leagueResult.message}
      />
    );
  }
  const league = leagueResult.data;

  // Defense in depth — the API already 404s out-of-scope leagues for
  // org_admin reads, but verify the league belongs to the caller's
  // active org before rendering.
  const scope = await loadMeScope();
  await openInActiveOrg(scope, league.orgId, `/leagues/${id}`);

  const [org, governingBodies, seasonsPage] = await Promise.all([
    orgs.get(league.orgId).catch(() => null),
    leagueMgmt.listGoverningBodies({}).catch(() => []),
    fetchAll((cursor) => leagueMgmt.listSeasons({ leagueId: league.id, limit: 100, cursor })).catch(() => ({ items: [] }))
  ]);

  const govBody = governingBodies.find((b) => b.id === league.governingBodyId);

  return (
    <LeagueDetail
      league={league}
      org={org}
      governingBodyName={govBody?.name ?? null}
      seasons={seasonsPage.items}
      actions={<LeagueActions league={league} governingBodies={governingBodies} />}
    />
  );
}
