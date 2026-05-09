import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type {
  Division,
  PricingTier,
  RegistrationForm,
  Season
} from "@sportspulse/api-client";
import { PricingClient } from "./pricing-client";

/**
 * Pricing section. Reuses the existing season-setup PricingTab via a
 * thin client wrapper so its mutations (auto-save on blur) round-trip
 * correctly inside this surface.
 */
export function PricingSection({
  form,
  season,
  tiers,
  divisions
}: {
  form: RegistrationForm;
  season: Season | null;
  tiers: PricingTier[];
  divisions: Division[];
}) {
  if (!season) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Bind this form to a season first"
        description="Pricing tiers are stored per (season, tier). Visit Season setup and roll over a season or pick one before configuring pricing."
      />
    );
  }
  return (
    <PricingClient
      formId={form.id}
      seasonId={season.id}
      tiers={tiers}
      divisions={divisions}
    />
  );
}
