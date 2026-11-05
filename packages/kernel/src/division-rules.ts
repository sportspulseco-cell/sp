import { DEFAULT_POINTS_RULE, parsePointsRule, parseTiebreakers, STANDINGS_TIEBREAKERS, type PointsRule, type StandingsTiebreaker } from "./game-results";

/**
 * Division game rules and post-season settings, as the org setup wizard
 * writes them to divisions.rule_set_overrides and divisions.playoff_config.
 *
 * One reader for every screen that turns a stored row back into the full
 * field set (copy a division, edit it, show it). Missing or invalid keys
 * fall back to the defaults a fresh division card starts with, so a legacy
 * row with {} reads as a complete rule set and never crashes a form.
 *
 * Not the same thing as PlayoffConfig in compliance.ts: that one lives on
 * seasons.config.playoffConfig and drives eligibility checks.
 */

export const DIVISION_CLOCK_TYPES = ["stopped", "running"] as const;
export type DivisionClockType = (typeof DIVISION_CLOCK_TYPES)[number];

/** Sudden death = first goal wins, no time limit. Shootout = skip OT, go to penalty shots. */
export const DIVISION_OVERTIME_RULES = ["none", "sudden_death", "shootout", "5_min", "10_min"] as const;
export type DivisionOvertimeRule = (typeof DIVISION_OVERTIME_RULES)[number];

export const DIVISION_BODY_CHECKING = ["permitted", "not_permitted_penalty", "not_permitted_no_penalty"] as const;
export type DivisionBodyChecking = (typeof DIVISION_BODY_CHECKING)[number];

export const PLAYOFF_SERIES_FORMATS = ["best_of_1", "best_of_3", "best_of_5", "best_of_7"] as const;
export type PlayoffSeriesFormat = (typeof PLAYOFF_SERIES_FORMATS)[number];

export const PLAYOFF_BRACKET_TYPES = ["single_elim", "double_elim", "round_robin"] as const;
export type PlayoffBracketType = (typeof PLAYOFF_BRACKET_TYPES)[number];

export const PLAYOFF_HOME_ICE_RULES = ["higher_seed_first", "alternating", "neutral"] as const;
export type PlayoffHomeIceRule = (typeof PLAYOFF_HOME_ICE_RULES)[number];

export interface DivisionGameRules {
  numberOfPeriods: number;
  periodLengthMin: number;
  clockType: DivisionClockType;
  overtimeRule: DivisionOvertimeRule;
  bodyChecking: DivisionBodyChecking;
  minStartersToStart: number;
  /** Subs/backups borrowed from another team for a single game. */
  maxGuestPlayersPerGame: number;
  /** Cap on permanent roster size for the season. */
  maxRosterSize: number;
}

export interface DivisionPlayoffConfig {
  enabled: boolean;
  /**
   * Who makes the playoffs: null means every team in the division (the
   * default, PPHL letter item 4), a number means the top N in the
   * standings. Stored as-is in divisions.playoff_config; the bracket
   * generator takes every team when no count is sent.
   */
  playoffSpots: number | null;
  /** YYYY-MM-DD, or "" when not set. */
  startDate: string;
  endDate: string;
  seriesFormat: PlayoffSeriesFormat;
  bracketType: PlayoffBracketType;
  homeIceRule: PlayoffHomeIceRule;
}

export interface DivisionAgeRange {
  min: number | null;
  max: number | null;
  label: string;
}

/** Everything a division stores besides its name, tier, gender, region and team cap. */
export interface DivisionRules {
  gameRules: DivisionGameRules;
  tiebreakers: StandingsTiebreaker[];
  pointsRule: PointsRule;
  ageRange: DivisionAgeRange;
  playoffConfig: DivisionPlayoffConfig;
}

export const DEFAULT_DIVISION_GAME_RULES: Readonly<DivisionGameRules> = {
  numberOfPeriods: 3,
  periodLengthMin: 20,
  clockType: "stopped",
  overtimeRule: "5_min",
  bodyChecking: "not_permitted_penalty",
  minStartersToStart: 6,
  maxGuestPlayersPerGame: 4,
  maxRosterSize: 20
};

export const DEFAULT_DIVISION_PLAYOFF_CONFIG: Readonly<DivisionPlayoffConfig> = {
  enabled: true,
  playoffSpots: null,
  startDate: "",
  endDate: "",
  seriesFormat: "best_of_1",
  bracketType: "single_elim",
  homeIceRule: "higher_seed_first"
};

export const DEFAULT_DIVISION_AGE_RANGE: Readonly<DivisionAgeRange> = {
  min: null,
  max: null,
  label: "Custom age group"
};

/** The order a new division card starts with: every step, in catalogue order. */
export const DEFAULT_DIVISION_TIEBREAKERS: readonly StandingsTiebreaker[] = [...STANDINGS_TIEBREAKERS];

/** A fresh, unshared copy of the defaults (safe to mutate in a form). */
export function defaultDivisionRules(): DivisionRules {
  return {
    gameRules: { ...DEFAULT_DIVISION_GAME_RULES },
    tiebreakers: [...DEFAULT_DIVISION_TIEBREAKERS],
    pointsRule: { ...DEFAULT_POINTS_RULE },
    ageRange: { ...DEFAULT_DIVISION_AGE_RANGE },
    playoffConfig: { ...DEFAULT_DIVISION_PLAYOFF_CONFIG }
  };
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const intAtLeast = (v: unknown, min: number, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= min ? v : fallback;

const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;

const calendarDate = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** The smallest bracket: two teams. */
export const MIN_PLAYOFF_SPOTS = 2;

/**
 * A stored playoffSpots value. A whole number of 2 or more is Top N;
 * anything else (missing, null, 0, 1, a string) means every team in the
 * division. Rows written before the choice existed keep their number.
 */
export function parsePlayoffSpots(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_PLAYOFF_SPOTS ? v : null;
}

/** "All teams" or "Top 4": the same words on every summary. */
export function playoffSpotsLabel(spots: number | null): string {
  return spots === null ? "All teams" : `Top ${spots}`;
}

/**
 * The full rule set of a stored division. Every key is present; anything
 * missing or malformed reads as the default, never as undefined.
 */
export function readDivisionRules(ruleSetOverrides: unknown, playoffConfig: unknown): DivisionRules {
  const rules = obj(ruleSetOverrides);
  const g = obj(rules.gameRules);
  const a = obj(rules.ageRange);
  const p = obj(playoffConfig);
  const d = DEFAULT_DIVISION_GAME_RULES;
  const dp = DEFAULT_DIVISION_PLAYOFF_CONFIG;
  const tiebreakers = parseTiebreakers(rules.tiebreakers);
  return {
    gameRules: {
      numberOfPeriods: intAtLeast(g.numberOfPeriods, 1, d.numberOfPeriods),
      periodLengthMin: intAtLeast(g.periodLengthMin, 1, d.periodLengthMin),
      clockType: oneOf(g.clockType, DIVISION_CLOCK_TYPES, d.clockType),
      overtimeRule: oneOf(g.overtimeRule, DIVISION_OVERTIME_RULES, d.overtimeRule),
      bodyChecking: oneOf(g.bodyChecking, DIVISION_BODY_CHECKING, d.bodyChecking),
      minStartersToStart: intAtLeast(g.minStartersToStart, 1, d.minStartersToStart),
      maxGuestPlayersPerGame: intAtLeast(g.maxGuestPlayersPerGame, 0, d.maxGuestPlayersPerGame),
      maxRosterSize: intAtLeast(g.maxRosterSize, 1, d.maxRosterSize)
    },
    tiebreakers: tiebreakers.length > 0 ? tiebreakers : [...DEFAULT_DIVISION_TIEBREAKERS],
    pointsRule: { ...DEFAULT_POINTS_RULE, ...parsePointsRule(rules.pointsRule) },
    ageRange: {
      min: intOrNull(a.min),
      max: intOrNull(a.max),
      label: typeof a.label === "string" ? a.label : DEFAULT_DIVISION_AGE_RANGE.label
    },
    playoffConfig: {
      enabled: typeof p.enabled === "boolean" ? p.enabled : dp.enabled,
      playoffSpots: parsePlayoffSpots(p.playoffSpots),
      startDate: calendarDate(p.startDate),
      endDate: calendarDate(p.endDate),
      seriesFormat: oneOf(p.seriesFormat, PLAYOFF_SERIES_FORMATS, dp.seriesFormat),
      bracketType: oneOf(p.bracketType, PLAYOFF_BRACKET_TYPES, dp.bracketType),
      homeIceRule: oneOf(p.homeIceRule, PLAYOFF_HOME_ICE_RULES, dp.homeIceRule)
    }
  };
}

/* ------------------------------ bounds ------------------------------ */

/** The whole numbers a division takes: its game rules plus the team cap. */
export type DivisionNumberKey =
  | "numberOfPeriods"
  | "periodLengthMin"
  | "minStartersToStart"
  | "maxGuestPlayersPerGame"
  | "maxRosterSize"
  | "maxTeams";

export interface DivisionNumberLimit {
  /** The words the forms use for this number, so a refusal names the field. */
  label: string;
  min: number;
  max: number;
  /** Spoken after the range: "from 5 to 60 minutes". */
  unit?: string;
}

/**
 * One range per number, read by the wizard, the Edit division dialog and
 * the API, so a value is refused with the same sentence everywhere. A
 * cleared field used to snap back to its default while typing, so "17"
 * typed over "20" became "2017" and the API stored it (PPHL, 4 Nov 2026).
 */
export const DIVISION_NUMBER_LIMITS: Readonly<Record<DivisionNumberKey, DivisionNumberLimit>> = {
  numberOfPeriods: { label: "Number of periods", min: 1, max: 4 },
  periodLengthMin: { label: "Period length", min: 5, max: 60, unit: "minutes" },
  minStartersToStart: { label: "Min skaters to start", min: 3, max: 20 },
  maxGuestPlayersPerGame: { label: "Max guest players per game", min: 0, max: 10 },
  maxRosterSize: { label: "Max roster size", min: 5, max: 40 },
  maxTeams: { label: "Max teams", min: 2, max: 64 }
};

const GAME_RULE_NUMBER_KEYS = [
  "numberOfPeriods",
  "periodLengthMin",
  "minStartersToStart",
  "maxGuestPlayersPerGame",
  "maxRosterSize"
] as const satisfies readonly (keyof DivisionGameRules & DivisionNumberKey)[];

/**
 * The sentence for one number that is missing, not whole or out of range,
 * or null when it is fine: "Period length must be a whole number from 5
 * to 60 minutes."
 */
export function divisionNumberProblem(key: DivisionNumberKey, value: unknown): string | null {
  const { label, min, max, unit } = DIVISION_NUMBER_LIMITS[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) return null;
  return `${label} must be a whole number from ${min} to ${max}${unit ? ` ${unit}` : ""}.`;
}

const choiceProblem = (label: string, value: unknown, allowed: readonly string[]): string | null =>
  value === undefined || (typeof value === "string" && allowed.includes(value))
    ? null
    : `${label} must be one of: ${allowed.join(", ")}.`;

/**
 * The first problem in a game rule set, in plain words, or null when every
 * value present is fine. Only the keys sent are checked: a row written
 * before a key existed still saves, and readDivisionRules fills the gap.
 * The API refuses with this sentence; the wizard shows it under the field
 * it names.
 */
export function validateDivisionGameRules(rules: unknown): string | null {
  if (rules === undefined || rules === null) return null;
  if (typeof rules !== "object" || Array.isArray(rules)) return "Game rules must be a set of named values.";
  const g = rules as Record<string, unknown>;
  for (const key of GAME_RULE_NUMBER_KEYS) {
    if (g[key] === undefined) continue;
    const problem = divisionNumberProblem(key, g[key]);
    if (problem) return problem;
  }
  return (
    choiceProblem("Clock type", g.clockType, DIVISION_CLOCK_TYPES) ??
    choiceProblem("Overtime", g.overtimeRule, DIVISION_OVERTIME_RULES) ??
    choiceProblem("Body checking", g.bodyChecking, DIVISION_BODY_CHECKING)
  );
}

/**
 * An independent copy of a rule set: editing the copy never touches the
 * source. Playoff dates belong to one season, so they are dropped unless
 * the copy stays in the same season (keepPlayoffDates).
 */
export function copyDivisionRules(
  source: DivisionRules,
  opts: { keepPlayoffDates?: boolean } = {}
): DivisionRules {
  const keep = opts.keepPlayoffDates ?? true;
  return {
    gameRules: { ...source.gameRules },
    tiebreakers: [...source.tiebreakers],
    pointsRule: { ...source.pointsRule },
    ageRange: { ...source.ageRange },
    playoffConfig: {
      ...source.playoffConfig,
      startDate: keep ? source.playoffConfig.startDate : "",
      endDate: keep ? source.playoffConfig.endDate : ""
    }
  };
}
