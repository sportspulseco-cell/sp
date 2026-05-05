import { ArrowLeft, Network } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leagueMgmt } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
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
    <div className="space-y-10">
      <Link
        href="/teams"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All teams
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Network} tint="rose" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>TEAM · {team.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {team.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {team.shortName && <Badge mono>{team.shortName}</Badge>}
            <Badge mono>{team.sportCode}</Badge>
            <Badge tone={statusTone(team.status)} mono>
              {team.status}
            </Badge>
          </div>
        </div>
      </header>

      <ResourceAdminsSection
        scopeType="team"
        scopeId={team.id}
        resourceLabel={team.name}
        allowedRoleCodes={["team_admin", "coach"]}
        description="Team admin (captain) and coach manage roster + lineups. Captains can also invite players directly from this surface."
      />
    </div>
  );
}
