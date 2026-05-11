import { Star, Users } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { captain, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { RosterScreen } from "./roster-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Manage roster — SportsPulse" };

export default async function CaptainRosterPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!isCaptain) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Manage roster" />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  const myTeamId = scope!.teamIds[0] ?? null;
  if (!myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Manage roster" />
        <EmptyState
          icon={Users}
          title="No team in scope"
          description="You hold the captain role but no team is currently scoped. Contact your league admin."
        />
      </div>
    );
  }

  const initialData = await captain.roster.list(myTeamId).catch(() => null);

  return <RosterScreen teamId={myTeamId} initial={initialData} />;
}
