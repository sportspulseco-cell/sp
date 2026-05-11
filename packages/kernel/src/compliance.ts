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
  "playoffEligibility"
] as const;
export type EligibilityCheckType = (typeof ELIGIBILITY_CHECK_TYPES)[number];

/**
 * Hard blocks cannot be waived. The waive endpoint rejects them with
 * 422. See Workflow 7C ARCH 3.
 */
export const HARD_BLOCK_CHECK_TYPES: ReadonlyArray<EligibilityCheckType> = [
  "ageRestriction",
  "genderEligibility",
  "rosterSize"
];

export function isHardBlockCheck(
  check: string
): check is "ageRestriction" | "genderEligibility" | "rosterSize" {
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
  status: "verified" | "expiring" | "expired" | "not_provided" | "flagged";
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
  status: "eligible" | "ineligible";
}

export interface GenderEligibilityEvaluation {
  divisionGender: string;
  personGenderSelfId: string | null;
  status: "eligible" | "ineligible";
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

export interface RuleEvaluation {
  usaHockeyId?: UsaHockeyEvaluation;
  ageRestriction?: AgeRestrictionEvaluation;
  genderEligibility?: GenderEligibilityEvaluation;
  rosterSize?: RosterSizeEvaluation;
  playoffEligibility?: PlayoffEligibilityEvaluation;
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
