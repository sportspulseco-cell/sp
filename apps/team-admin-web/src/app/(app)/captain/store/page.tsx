import { ShoppingBag, Star } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, teamStore } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { StoreManager } from "./store-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team store — SportsPulse" };

/**
 * Backlog #11 — captain merch catalog. Curate jerseys/hoodies/etc;
 * the player-web `/store` surface displays the active rows.
 *
 * Purchase flow is deferred until real Stripe (P4-1) — for now the
 * catalog only stores price + stock; players will see "Coming soon"
 * on the purchase button.
 */
export default async function CaptainStorePage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const myTeamId = scope?.teamIds[0] ?? null;

  if (!isCaptain || !myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Team store" />
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
        eyebrow="// Captain console"
        title="Team store"
        description="Add merch your team can browse from their player app. Checkout will arrive once Stripe is wired in P4."
      />
      {initial.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No products yet"
          description="Add your first product below — jersey, hoodie, hat, whatever the team wants."
        />
      ) : null}
      <StoreManager teamId={myTeamId} initialItems={initial.items} />
    </div>
  );
}
