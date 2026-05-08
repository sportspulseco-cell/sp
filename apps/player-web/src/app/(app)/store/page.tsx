import { ShoppingBag } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Team store — SportsPulse" };

export default function StorePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Team store"
        title="Team store"
        description="Jerseys, hoodies, and league swag. Embedded Shopify storefront ships once the org connects their store."
      />
      <EmptyState
        icon={ShoppingBag}
        title="Team store coming soon"
        description="When your league admin connects the org's Shopify storefront, the team store renders here as an embedded shopfront. Until then there's nothing to browse."
      />
    </div>
  );
}
