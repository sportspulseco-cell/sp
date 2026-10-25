/**
 * Workflow 7C — compliance, eligibility & playoff types.
 *
 * Canonical shape of `eligibility_records.rule_evaluation` and the
 * classification of each check (HARD / SOFT / FLAG / PLAYOFF). Used
 * by API + UI to keep audit JSON consistent and to decide which
 * blocks can be waived.
 */

// =====================================================================
// CHECK TYPES
// =====================================================================
export const ELIGIBILITY_CHECK_TYPES = [
  "ageRestriction",
  "genderEligibility",
  "rosterSize",
  "usaHockeyId",
  "playoffEligibility",
  "suspension"
] as const;
export type EligibilityCheckType = (typeof ELIGIBILITY_CHECK_TYPES)[number];

/**
 * Hard blocks cannot be waived. The waive endpoint rejects them with
 * 422. See Workflow 7C ARCH 3.
 */
export const HARD_BLOCK_CHECK_TYPES: ReadonlyArray<EligibilityCheckType> = [
  "ageRestriction",
  "genderEligibility",
  "rosterSize",
  // A suspension is lifted on the suspension itself (POST /suspensions/:id/lift),
  // never waived on the eligibility record.
  "suspension"
];

export function isHardBlockCheck(
  check: string
): check is "ageRestriction" | "genderEligibility" | "rosterSize" | "suspension" {
  return (HARD_BLOCK_CHECK_TYPES as ReadonlyArray<string>).includes(check);
}

// =====================================================================
// ELIGIBILITY STATUS — must match eligibility_records.status check
// =====================================================================
export const ELIGIBILITY_STATUSES = [
  "pending",
  "eligible",
  "ineligible",
  "expiring",
  "expired",
  "flagged",
  "waived"
] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

// =====================================================================
// CANONICAL ruleEvaluation JSONB SHAPE
// Spec §1.1 — every read/write must conform exactly.
// =====================================================================

export interface UsaHockeyEvaluation {
  provided: string | null;
  expiresAt: string | null;
  source: "self_attest" | "live_api";
  /**
   * `pending` = self-attested and not verified yet; `mismatch` = the
   * identity check failed. Neither counts as verified (COMP-14).
   */
  status: "verified" | "expiring" | "expired" | "not_provided" | "pending" | "mismatch" | "flagged";
  checkedAt: string;
  adminWaived: boolean;
  waiveReason: string | null;
  waivedByUserId?: string;
  waivedAt?: string;
}

export interface AgeRestrictionEvaluation {
  dobDate: string | null;
  referenceDate: string;
  ageGroupCode: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
  ageAtReferenceDate: number | null;
  /** `unknown` = an age rule applies but no date of birth is on file; `not_required` = no age rule. */
  status: "eligible" | "ineligible" | "unknown" | "not_required";
}

export interface GenderEligibilityEvaluation {
  divisionGender: string;
  personGenderSelfId: string | null;
  /** `unknown` = gendered division, no gender on file; `flagged` = mismatch for an admin to review. */
  status: "eligible" | "ineligible" | "unknown" | "flagged";
}

export interface RosterSizeEvaluation {
  countAtCheck: number;
  maxAllowed: number;
  status: "eligible" | "blocked";
}

export interface PlayoffEligibilityEvaluation {
  gamesPlayed: number;
  minRequired: number;
  usaHockeyValidAtPlayoffStart: boolean;
  guestAppearancesForThisTeam: number;
  guestSeasonLimit: number;
  status: "eligible" | "ineligible";
  failedChecks?: string[];
}

/** Suspensions standing when the sweep ran (UC-14, COMP-14). */
export interface SuspensionEvaluation {
  status: "clear" | "suspended";
  checkedAt: string;
  suspensions: Array<{
    id: string;
    kind: string;
    gamesRemaining: number | null;
    endsAt: string | null;
    reason: string | null;
    label: string;
  }>;
}

export interface RuleEvaluation {
  usaHockeyId?: UsaHockeyEvaluation;
  ageRestriction?: AgeRestrictionEvaluation;
  genderEligibility?: GenderEligibilityEvaluation;
  rosterSize?: RosterSizeEvaluation;
  playoffEligibility?: PlayoffEligibilityEvaluation;
  suspension?: SuspensionEvaluation;
}

// =====================================================================
// PLAYOFF CONFIG — stored on seasons.config.playoffConfig
// =====================================================================
export interface PlayoffConfig {
  enabled: boolean;
  /** ISO date — when playoffs start. Used for USA Hockey ID expiry check. */
  startDate: string | null;
  /** Min regular-season games to qualify. Defaults from DIVISION_RULES. */
  minGamesPlayedToQualify: number;
  seriesFormat?: "single" | "bo3" | "bo5" | "bo7";
}

export const PLAYOFF_CONFIG_DEFAULTS: PlayoffConfig = {
  enabled: false,
  startDate: null,
  minGamesPlayedToQualify: 8,
  seriesFormat: "bo3"
};

export function resolvePlayoffConfig(
  raw: Partial<PlayoffConfig> | null | undefined
): PlayoffConfig {
  return { ...PLAYOFF_CONFIG_DEFAULTS, ...(raw ?? {}) };
}
