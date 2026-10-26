import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { TeamDetail } from "@sportspulse/admin-pages";
import { TeamActions } from "@/components/edit/detail-actions";
import { leagueMgmt, orgAdminTeams } from "@/lib/api/server-api";
import { CaptainAssignment } from "./captain-assignment";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team · Org Admin" };

/**
 * Org-admin's team detail. Body is the shared @sportspulse/admin-pages
 * TeamDetail; the org-admin-specific CaptainAssignment widget mounts
 * in the `extras` slot (sa-web mounts ResourceAdminsSection there
 * instead).
 *
 * Two fetches:
 *   - `leagueMgmt.getTeam` — full canonical Team (AuthorizedAccessGuard
 *     accepts org_admin via org scope).
 *   - `orgAdminTeams.detail` — captains list for the assignment widget.
 *     Both run in parallel.
 */
export default async function OrgAdminTeamDetailPage({
  params
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [teamResult, detailResult] = await Promise.all([
    load(leagueMgmt.getTeam(teamId)),
    load(orgAdminTeams.detail(teamId))
  ]);
  if (!teamResult.ok) {
    if (teamResult.status === 404) notFound();
    return (
      <LoadError
        what="this team"
        status={teamResult.status}
        message={teamResult.message}
      />
    );
  }
  if (!detailResult.ok) {
    if (detailResult.status === 404) notFound();
    return (
      <LoadError
        what="this team"
        status={detailResult.status}
        message={detailResult.message}
      />
    );
  }
  const team = teamResult.data;
  const detail = detailResult.data;

  return (
    <TeamDetail
      team={team}
      actions={<TeamActions team={team} />}
      extras={
        <CaptainAssignment
          teamId={team.id}
          orgId={team.orgId}
          initialCaptains={detail.captains}
        />
      }
    />
  );
}
