import { notFound } from "next/navigation";
import { TeamDetail } from "@sportspulse/admin-pages";
import { leagueMgmt, orgAdminTeams } from "@/lib/api/server-api";
import { CaptainAssignment } from "./captain-assignment";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team — Org admin" };

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
  const [team, detail] = await Promise.all([
    leagueMgmt.getTeam(teamId).catch(() => null),
    orgAdminTeams.detail(teamId).catch(() => null)
  ]);
  if (!team || !detail) notFound();

  return (
    <TeamDetail
      team={team}
      extras={
        <CaptainAssignment teamId={team.id} initialCaptains={detail.captains} />
      }
    />
  );
}
