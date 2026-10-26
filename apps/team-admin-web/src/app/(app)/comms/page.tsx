import { Star } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { TeamMessageForm } from "./message-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message the team — SportsPulse" };

/**
 * Captain's team message (UC-20, MON-12): write to the roster, captains
 * and coaches by email and in the app. Captains only; the API checks the
 * caller captains the team.
 */
export default async function CommsPage() {
  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Your team" title="Message the team" description="Captains write to their team here." />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to make you the team's captain."
        />
      </div>
    );
  }
  const team = await leagueMgmt.getTeam(teamId).catch(() => null);
  const teamName = team?.name ?? "Your team";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your team"
        title="Message the team"
        description={`Write to ${teamName}'s players, captains and coaches. They get it by email, in the app, or both.`}
      />
      <TeamMessageForm teamId={teamId} teamName={teamName} />
    </div>
  );
}
