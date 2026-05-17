"use client";

import { useState } from "react";
import type { Division, PricingTier } from "@sportspulse/api-client";
import { PricingTab } from "@/components/registrations/tabs/pricing-tab";
import { SectionHeader } from "@sportspulse/forms-builder";

/**
 * Wrapper around the existing PricingTab — owns the local tier state
 * so the auto-save (PATCH on blur) can update the in-memory list
 * without forcing a full refresh.
 */
export function PricingClient({
  formId: _formId,
  seasonId,
  tiers: initial,
  divisions
}: {
  formId: string;
  seasonId: string;
  tiers: PricingTier[];
  divisions: Division[];
}) {
  const [tiers, setTiers] = useState(initial);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pricing"
        subtitle="Standard tiers, custom pricing, payment timeline"
      />
      <PricingTab
        seasonId={seasonId}
        divisions={divisions}
        tiers={tiers}
        onTiersChange={setTiers}
      />
    </div>
  );
}
