import { Inbox, ShieldAlert } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { JoinRequestsClient } from "./join-requests-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Join requests — SportsPulse" };

export default async function CaptainJoinRequestsPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !teamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// captain console"
          title="Join requests"
        />
        <EmptyState
          icon={ShieldAlert}
          title="Captain role required"
          description="Only the team's captain can review join requests."
        />
      </div>
    );
  }

  const initial = await registration
    .captainListJoinRequests(teamId, "pending")
    .catch(() => ({ items: [] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// captain console"
        title="Join requests"
        description="Players who've completed registration and applied to join your team. Approve to add them to the active roster; deny to send them back to the team-search flow."
      />
      {initial.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending requests"
          description="Players who apply to your team via Find a team show up here. You'll get a notification when one lands."
        />
      ) : (
        <JoinRequestsClient teamId={teamId} initial={initial.items} />
      )}
    </div>
  );
}
