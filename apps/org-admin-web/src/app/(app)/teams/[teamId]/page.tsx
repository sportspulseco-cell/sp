import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@sportspulse/ui";
import { orgAdminTeams } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { CaptainAssignment } from "./captain-assignment";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team — Org admin" };

export default async function OrgAdminTeamDetailPage({
  params
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const data = await orgAdminTeams.detail(teamId).catch(() => null);
  if (!data) notFound();

  const { team, captains } = data;

  return (
    <div className="space-y-8">
      <Link
        href="/teams"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All teams
      </Link>

      <PageHeader
        eyebrow={`// TEAM · ${team.id.slice(0, 8)}`}
        title={team.name}
        description={
          team.shortName
            ? `${team.sportCode.toUpperCase()} · ${team.shortName}`
            : team.sportCode.toUpperCase()
        }
        action={
          <Badge mono tone={team.status === "active" ? "success" : "neutral"}>
            {team.status}
          </Badge>
        }
      />

      <CaptainAssignment teamId={team.id} initialCaptains={captains} />
    </div>
  );
}
