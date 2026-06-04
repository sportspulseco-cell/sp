import { notFound } from "next/navigation";
import { TeamDetail } from "@sportspulse/admin-pages";
import { leagueMgmt, orgAdminTeams } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { CaptainAssignment } from "./captain-assignment";

export const metadata = { title: "Team — SportsPulse" };

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [team, detail] = await Promise.all([
    leagueMgmt.getTeam(id).catch(() => null),
    orgAdminTeams.detail(id).catch(() => null)
  ]);
  if (!team) notFound();

  return (
    <TeamDetail
      team={team}
      extras={
        <div className="space-y-8">
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
