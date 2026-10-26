import { Inbox, ShieldAlert } from "lucide-react";
import { EmptyState, LoadError } from "@sportspulse/ui";
import { loadMeScope, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { JoinRequestsClient } from "./join-requests-client";
import { load } from "@sportspulse/api-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Join requests · Team Admin" };

export default async function CaptainJoinRequestsPage() {
  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !teamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="captain console"
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

  const initialResult = await load(registration.captainListJoinRequests(teamId, "pending"));
  const initial = initialResult.ok ? initialResult.data : { items: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="captain console"
        title="Join requests"
        description="Players who've completed registration and applied to join your team. Approve to add them to the active roster; deny to send them back to the team-search flow."
      />
      {!initialResult.ok ? (
        <LoadError what="join requests" status={initialResult.status} message={initialResult.message} />
      ) : initial.items.length === 0 ? (
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
