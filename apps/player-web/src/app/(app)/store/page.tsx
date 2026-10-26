import { ShoppingBag, UsersRound } from "lucide-react";
import { EmptyState, PageHeader } from "@sportspulse/ui";
import { loadMeScope, teamStore } from "@/lib/api/server-api";
import { StoreClient } from "./store-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team store — SportsPulse" };

/**
 * Team store (UC-26): the roster's gear, ordered here and paid on
 * Payments. Players on the roster order; anyone else who can see the
 * store browses only.
 */
export default async function StorePage() {
  const scope = await loadMeScope();
  const myTeamId = scope?.teamIds[0] ?? null;

  if (!myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Team store"
          title="Team store"
          description="Merch from your team's captain."
        />
        <EmptyState
          icon={UsersRound}
          title="Not on a roster yet"
          description="Once your captain adds you to the team, you'll see their merch catalog here."
        />
      </div>
    );
  }

  const data = await teamStore
    .listForTeam(myTeamId)
    .catch(() => ({ team: { id: myTeamId, name: "Your team" }, items: [] }));

  if (data.items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Team store"
          title={`${data.team.name} store`}
          description="Merch from your captain."
        />
        <EmptyState
          icon={ShoppingBag}
          title="Nothing in the store yet"
          description="Your captain hasn't added any merch. Check back later, or nudge them to add some."
        />
      </div>
    );
  }

  // Roster name and number for the back, and this player's orders.
  const me = await teamStore.me(myTeamId).catch(() => null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team store"
        title={`${data.team.name} store`}
        description={
          me
            ? "Pick a size and the name and number on the back. You pay the order's invoice on Payments."
            : "Your captain's gear for the team. Only players on the roster can order."
        }
      />
      <StoreClient
        teamId={myTeamId}
        products={data.items}
        backName={me?.backName ?? null}
        jerseyNumber={me?.jerseyNumber ?? null}
        initialOrders={me?.orders ?? []}
        canOrder={!!me}
      />
    </div>
  );
}
