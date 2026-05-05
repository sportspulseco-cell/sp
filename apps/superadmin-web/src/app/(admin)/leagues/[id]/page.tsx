import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leagueMgmt } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "League — SportsPulse" };

export default async function LeagueDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const league = await leagueMgmt.getLeague(id).catch(() => null);
  if (!league) notFound();

  return (
    <div className="space-y-10">
      <Link
        href="/leagues"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All leagues
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Trophy} tint="amber" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>LEAGUE · {league.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {league.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge mono>{league.sportCode}</Badge>
            <Badge mono>{league.format}</Badge>
            <Badge tone={statusTone(league.status)} mono>
              {league.status}
            </Badge>
          </div>
        </div>
      </header>

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
    </div>
  );
}
