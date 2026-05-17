import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type {
  Division,
  PricingTier,
  RegistrationForm,
  Season
} from "@sportspulse/api-client";
import { DivisionsClient } from "@sportspulse/forms-builder";

/**
 * Divisions & eligibility section. Two cards:
 *   1) Assign divisions to pricing tier (N:M checkbox grid)
 *   2) Eligibility & roster rules (writes to seasons.config JSONB)
 */
export function DivisionsSection({
  form,
  season,
  tiers,
  divisions,
  tierAssignments
}: {
  form: RegistrationForm;
  season: Season | null;
  tiers: PricingTier[];
  divisions: Division[];
  tierAssignments: Record<string, string[]>;
}) {
  if (!season) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Bind this form to a season first"
        description="Divisions are season-scoped. Visit Season setup before assigning them."
      />
    );
  }
  return (
    <DivisionsClient
      formId={form.id}
      season={season}
      tiers={tiers}
      divisions={divisions}
      tierAssignments={tierAssignments}
    />
  );
}
