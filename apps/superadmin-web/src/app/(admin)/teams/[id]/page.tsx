import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { TeamDetail } from "@sportspulse/admin-pages";
import { leagueMgmt, orgAdminTeams } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { TeamMovementSection } from "@/components/teams/team-movement-section";
import { CaptainAssignment } from "./captain-assignment";
import { TeamActions } from "@/components/edit/detail-actions";

export const metadata = { title: "Team · Super Admin" };

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [teamResult, detail] = await Promise.all([
    load(leagueMgmt.getTeam(id)),
    orgAdminTeams.detail(id).catch(() => null)
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
  const team = teamResult.data;

  return (
    <TeamDetail
      team={team}
      actions={<TeamActions team={team} />}
      extras={
        <div className="space-y-8">
          <TeamMovementSection teamId={team.id} teamName={team.name} orgId={team.orgId} />
          <CaptainAssignment
            teamId={team.id}
            orgId={team.orgId}
            initialCaptains={detail?.captains ?? []}
          />
          <ResourceAdminsSection
            scopeType="team"
            scopeId={team.id}
            resourceLabel={team.name}
            allowedRoleCodes={["coach"]}
            description="Coach manages lineups and helps the captain run the roster. The captain assignment lives in the dedicated widget above."
          />
        </div>
      }
    />
  );
}
