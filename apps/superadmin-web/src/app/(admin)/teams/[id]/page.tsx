import { notFound } from "next/navigation";
import { TeamDetail } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "Team — SportsPulse" };

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const team = await leagueMgmt.getTeam(id).catch(() => null);
  if (!team) notFound();

  return (
    <TeamDetail
      team={team}
      extras={
        <ResourceAdminsSection
          scopeType="team"
          scopeId={team.id}
          resourceLabel={team.name}
          allowedRoleCodes={["team_admin", "coach"]}
          description="Team admin (captain) and coach manage roster + lineups. Captains can also invite players directly from this surface."
        />
      }
    />
  );
}
