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
  playoffSpots: number;
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
  playoffSpots: 8,
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
      playoffSpots: intAtLeast(p.playoffSpots, 2, dp.playoffSpots),
      startDate: calendarDate(p.startDate),
      endDate: calendarDate(p.endDate),
      seriesFormat: oneOf(p.seriesFormat, PLAYOFF_SERIES_FORMATS, dp.seriesFormat),
      bracketType: oneOf(p.bracketType, PLAYOFF_BRACKET_TYPES, dp.bracketType),
      homeIceRule: oneOf(p.homeIceRule, PLAYOFF_HOME_ICE_RULES, dp.homeIceRule)
    }
  };
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
