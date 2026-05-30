/**
 * Canonical constraint catalogue + placement-pass vocabulary.
 *
 * Single source of truth shared by the orchestrator (scheduling-api),
 * the CP-SAT solver service, the Z3 verifier, and the provenance store
 * (`game_provenance.constraint_ids`, `game_provenance.placement_pass`).
 * Never hard-code these strings elsewhere — import from here so the API,
 * solver, and audit surface can never drift (the permissions-catalogue
 * rule from CLAUDE.md applied to scheduling).
 */

/** Hard constraints — a violation breaks the league. Binary predicates. */
export const HARD_CONSTRAINTS = {
  NO_VENUE_DOUBLE_BOOK: "no_venue_double_book",
  NO_TEAM_OVERLAP: "no_team_overlap",
  NO_SELF_PLAY: "no_self_play",
  LOCKED_FIXTURE_PINNED: "locked_fixture_pinned",
  PLAYOFF_SLOT_RESERVED: "playoff_slot_reserved",
  DIVISION_CONTAINMENT: "division_containment",
  TOURNAMENT_BLACKOUT: "tournament_blackout",
  PAIRING_COUNT: "pairing_count"
} as const;

/** Soft constraints — expressed as objective terms (CP-SAT) or post-pass. */
export const SOFT_CONSTRAINTS = {
  TIME_SLOT_FAIRNESS: "time_slot_fairness",
  HOME_AWAY_BALANCE: "home_away_balance",
  GAP_BALANCE: "gap_balance",
  REQUIRED_DAYS: "required_days"
} as const;

export type HardConstraintId =
  (typeof HARD_CONSTRAINTS)[keyof typeof HARD_CONSTRAINTS];
export type SoftConstraintId =
  (typeof SOFT_CONSTRAINTS)[keyof typeof SOFT_CONSTRAINTS];
export type ConstraintId = HardConstraintId | SoftConstraintId;

/**
 * How a game entered its slot. Mirrors the DB CHECK on
 * `game_provenance.placement_pass`.
 */
export const PLACEMENT_PASSES = [
  "initial_assignment",
  "balancing",
  "conflict_resolution",
  "manual_import",
  "manual_override",
  "locked_import",
  "bracket"
] as const;
export type PlacementPass = (typeof PLACEMENT_PASSES)[number];

/** Time-of-day bands for fairness accounting. Mirrors ice_slots.band. */
export const TIME_BANDS = ["early", "mid", "late"] as const;
export type TimeBand = (typeof TIME_BANDS)[number];
