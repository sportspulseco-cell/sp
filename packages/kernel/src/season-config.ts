/**
 * Per-season admin toggles. Stored in `seasons.config` JSONB.
 *
 * Replaces the previously hard-coded behaviour in the registration
 * funnel (e.g. always-required USA Hockey ID, always-allowed free
 * agent path) with admin-managed flags per season. The funnel reads
 * `SeasonConfig` and adapts its steps + validation accordingly.
 *
 * Schema mirrored in the DB COLUMN COMMENT on `seasons.config`
 * (migration 0016). Drizzle stores it as `jsonb`; the DTO casts it
 * to this type.
 *
 * All fields optional with documented defaults — an existing season
 * with `config = {}` falls through to the defaults so behaviour is
 * unchanged until the admin edits anything.
 */

export interface SeasonConfig {
  /**
   * If true, registrants must submit a valid USA Hockey ID + future
   * expiry. Funnel blocks advancement past Phase 3 if missing.
   * Default: false (was hard-coded true previously — admin must
   * explicitly opt in now).
   */
  requireUsaHockeyId?: boolean;

  /**
   * If true, the funnel's path-selection screen shows the "Free
   * agent" card.
   * Default: false.
   */
  allowFreeAgent?: boolean;

  /**
   * If true, registrants whose DOB indicates age < 18 must complete
   * the parental consent flow. (The funnel already auto-detects DOB;
   * this toggle gates whether the consent step appears at all —
   * useful for adult-only leagues that skip it entirely.)
   * Default: true (safer default — consent is the conservative side).
   */
  parentalConsentRequired?: boolean;

  /**
   * If true, the liability waiver is a hard block — registration
   * cannot complete without a typed signature.
   * Default: true.
   */
  requireLiabilityWaiver?: boolean;

  /**
   * Hard cap on team rosters. Used by team-creation + roster-add
   * flows to refuse the (N+1)th player.
   * Default: undefined (no cap enforced).
   */
  maxRosterSize?: number;

  /**
   * After this timestamp, roster moves block. Spec § Divisions &
   * eligibility. Stored as ISO 8601 string in JSONB.
   * Default: undefined (no lock enforced).
   */
  rosterLockAt?: string;
}

export const SEASON_CONFIG_DEFAULTS: Required<
  Pick<
    SeasonConfig,
    "requireUsaHockeyId" | "allowFreeAgent" | "parentalConsentRequired" | "requireLiabilityWaiver"
  >
> = {
  requireUsaHockeyId: false,
  allowFreeAgent: false,
  parentalConsentRequired: true,
  requireLiabilityWaiver: true
};

/**
 * Resolve a stored `seasons.config` blob into a fully-defaulted
 * `SeasonConfig`. Use this in handlers + the funnel rather than
 * reading raw JSONB.
 */
export function resolveSeasonConfig(
  raw: Partial<SeasonConfig> | null | undefined
): Required<
  Pick<
    SeasonConfig,
    "requireUsaHockeyId" | "allowFreeAgent" | "parentalConsentRequired" | "requireLiabilityWaiver"
  >
> &
  Pick<SeasonConfig, "maxRosterSize" | "rosterLockAt"> {
  return {
    ...SEASON_CONFIG_DEFAULTS,
    ...(raw ?? {})
  };
}
