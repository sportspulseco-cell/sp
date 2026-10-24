import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { LeagueDetail } from "@sportspulse/admin-pages";
import { LeagueActions } from "@/components/edit/detail-actions";
import { leagueMgmt, orgs } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "League — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * View-only league detail. Body is rendered by the shared
 * @sportspulse/admin-pages LeagueDetail component — org-admin-web
 * mounts the same component, so the UI is canonical without
 * exposing the confidential super-admin URL (BUG-043 family).
 *
 * The role-assignment panel (sa-only for now) is passed via the
 * `extras` slot so the shared component stays presentation-pure.
 */
export default async function LeagueDetailPage({
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
      extras={
        <ResourceAdminsSection
          scopeType="league"
          scopeId={league.id}
          resourceLabel={league.name}
          allowedRoleCodes={[
            "league_admin",
            "registrar",
            "referee",
            "scorekeeper"
          ]}
          description="League admins manage divisions, teams, and schedules. Registrars review submissions; refs and scorekeepers run game-day."
        />
      }
    />
  );
}
