import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { leagueMgmt, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { FindTeamClient } from "./find-team-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Find a team — SportsPulse" };

export default async function FindTeamPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await registration.getMyRegistration(id).catch(() => null);
  if (!r) notFound();
  if (r.status !== "approved") {
    return (
      <div className="space-y-6">
        <Link
          href={`/registrations/${id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to registration
        </Link>
        <EmptyState
          icon={Users}
          title="Not approved yet"
          description="You can browse teams once an admin approves your registration."
        />
      </div>
    );
  }

  // Scope: division-bound registration → teams that have an active
  // entry in that division. Org-only registration → every team in the
  // org (the captain still decides whether to accept).
  const teamsPage = await leagueMgmt
    .listTeams({ orgId: r.orgId })
    .catch(() => ({ items: [], nextCursor: null }));

  // Already-pending requests so we can disable the Apply button.
  const myRequests = await registration
    .listMyJoinRequests()
    .catch(() => ({ items: [] }));
  const pendingByTeam = new Set(
    myRequests.items
      .filter((i) => i.status === "pending")
      .map((i) => i.teamId)
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/registrations/${id}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to registration
      </Link>

      <PageHeader
        eyebrow={`// ${r.orgName ?? "find a team"}`}
        title="Find a team"
        description={
          r.divisionName
            ? `Teams in ${r.divisionName} — pick one and apply. The team's captain will accept or decline.`
            : "Browse teams in your org and apply to one. The team's captain will accept or decline."
        }
      />

      {teamsPage.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teams yet"
          description="Once captains register teams under this org you'll see them here."
        />
      ) : (
        <FindTeamClient
          teams={teamsPage.items.map((t) => ({
            id: t.id,
            name: t.name,
            shortName: t.shortName,
            sportCode: t.sportCode,
            status: t.status,
            captainUserId: t.captainUserId,
            alreadyPending: pendingByTeam.has(t.id)
          }))}
        />
      )}
    </div>
  );
}
