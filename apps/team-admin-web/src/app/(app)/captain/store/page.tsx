import { Star } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { loadMeScope, teamStore } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { StoreManager } from "./store-manager";
import { StoreOrders } from "./store-orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team store — SportsPulse" };

/**
 * Team store (UC-25, UC-26): generate the team's gear from the roster or
 * add items by hand, and fulfil the orders players place from their app.
 * Players pay an order's invoice on their Payments page (mock card).
 */
export default async function CaptainStorePage() {
  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const myTeamId = scope?.teamIds[0] ?? null;

  if (!isCaptain || !myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Captain console" title="Team store" />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  const initial = await teamStore
    .listForCaptain(myTeamId)
    .catch(() => ({ items: [] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Captain console"
        title="Team store"
        description="Your team's gear. Players on the roster order it in their app and pay on their Payments page."
      />
      <StoreManager teamId={myTeamId} initialItems={initial.items} />
      <StoreOrders teamId={myTeamId} />
    </div>
  );
}
