import type { FormDefinition } from "@sportspulse/kernel";

/**
 * Subset of the registration v2 PricingTier that the funnel actually
 * renders. Mirrors the fields on `pricing_tiers` so this package
 * doesn't need a circular dep on the superadmin SDK.
 */
export interface PricingTier {
  id: string;
  seasonId: string;
  name: string;
  code: string | null;
  description: string | null;
  divisionId: string | null;
  currency: string;
  fullPriceCents: number;
  isFree: boolean;
  paymentPlanEnabled: boolean;
  depositCents: number;
  installmentCount: number;
  installmentIntervalDays: number;
  lateFeeCents: number;
  usageLimit: number | null;
  usageCount: number;
  customUrlSlug: string | null;
  isReturningTeamPricing: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSeasonContext {
  season: {
    id: string;
    name: string;
    sportCode: string;
    startDate: string;
    endDate: string;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
    rosterLockAt: string | null;
    status: string;
    /**
     * Per-season toggles from the admin wizard's Divisions &
     * eligibility step. Funnel reads `allowFreeAgent` (gates the
     * free-agent path card) and `parentalConsentRequired` (skips
     * the consent step when false even for minors). Schema lives in
     * @sportspulse/kernel SeasonConfig. Optional for back-compat.
     */
    config?: Record<string, unknown>;
  };
  pricingTiers: PricingTier[];
  formVersionId: string | null;
  formDefinition: FormDefinition;
}

export type SubmissionType =
  | "team"
  | "individual"
  | "free_agent"
  | "captain_invite";

export interface WaiverDoc {
  documentId: string;
  kind: string;
  name: string;
  description: string | null;
  versionId: string;
  contentHtml: string;
  languageCode: string;
}
