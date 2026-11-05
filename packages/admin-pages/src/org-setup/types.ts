import { pointsRuleForm, type PointsRuleForm } from "../divisions/points-rule";
import {
  DEFAULT_DIVISION_TIEBREAKERS,
  DEFAULT_POINTS_RULE,
  copyDivisionRules,
  defaultDivisionRules,
  divisionNumberProblem,
  validateDivisionGameRules,
  type DivisionBodyChecking,
  type DivisionClockType,
  type DivisionGameRules,
  type DivisionOvertimeRule,
  type DivisionPlayoffConfig,
  type PlayoffBracketType,
  type PlayoffHomeIceRule,
  type PlayoffSeriesFormat,
  type StandingsTiebreaker
} from "@sportspulse/kernel";
/**
 * Wizard state shape — mirrors mockup field-for-field. Submitted to:
 *   - leagues.metadata for { slug, branding, privacy }
 *   - leagues.{name, sportCode, format, governingBodyId, ruleSetId}
 *   - seasons.{name, startDate, endDate, registrationOpensAt,
 *     registrationClosesAt, rosterLockAt, timezone}
 *   - divisions.{name, tier, genderEligibility, ageGroupId, maxTeams}
 *   - divisions.ruleSetOverrides for game rules + tiebreakers
 *   - divisions.playoffConfig for post-season config
 */

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type LeagueFormat = "regular" | "tournament" | "pickup" | "friendly";
export type Privacy = "public" | "unlisted" | "private";
export type Gender = "open" | "male" | "female" | "mixed";
export type Tier = "A" | "B" | "C" | "D" | "Premier" | null;
// Canonical choices and defaults: @sportspulse/kernel division-rules.ts.
export type ClockType = DivisionClockType;
export type BodyChecking = DivisionBodyChecking;
export type SeriesFormat = PlayoffSeriesFormat;
export type BracketType = PlayoffBracketType;
export type HomeIceRule = PlayoffHomeIceRule;
/** Sudden death = first goal wins, no time limit. Shootout = skip OT, go to penalty shots. */
export type OvertimeRule = DivisionOvertimeRule;
/** Canonical list: @sportspulse/kernel STANDINGS_TIEBREAKERS (used by standings). */
export type TiebreakerCode = StandingsTiebreaker;

export interface LeagueDraft {
  name: string;
  slug: string;
  sportCode: string;
  format: LeagueFormat;
  governingBodyId: string | null;
  timezone: string;
  branding: {
    logoUrl: string | null;
    primaryColor: string;
  };
  privacy: Privacy;
}

export interface SeasonDraft {
  name: string;
  startDate: string;
  endDate: string;
  /**
   * Playoff window. Both optional; when one is set, both must be set
   * and must satisfy startDate ≤ playoffStartDate ≤ playoffEndDate ≤
   * endDate. Empty string = unset. The day before playoffStartDate is
   * the implicit "regular season finale" — no separate field.
   */
  playoffStartDate: string;
  playoffEndDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  rosterLockAt: string;
}

export type GameRules = DivisionGameRules;
export type PlayoffConfig = DivisionPlayoffConfig;

/** Sentinel for "type a new region name" in the region picker. */
export const NEW_REGION = "__new__";

export interface DivisionDraft {
  uid: string; // local-only for the form list
  /**
   * Local-only: set on a card made with Copy, e.g. "Division 1". Shown as
   * a hint until the copy has a name. Never sent to the API.
   */
  copiedFrom?: string;
  name: string;
  tier: Tier;
  /** Existing region id, NEW_REGION, or null for "no region". */
  regionId: string | null;
  /** New region name, used only when regionId === NEW_REGION. */
  regionName: string;
  genderEligibility: Gender;
  ageGroupId: string | null;
  ageRangeMin: number | null;
  ageRangeMax: number | null;
  ageGroupLabel: string;
  maxTeams: number;
  gameRules: GameRules;
  tiebreakers: TiebreakerCode[];
  /** Standings points per result (FR-3.13.1); stored as ruleSetOverrides.pointsRule. */
  points?: PointsRuleForm;
  playoffConfig: PlayoffConfig;
}

export interface WizardState {
  step: WizardStep;
  orgId: string | null;
  league: LeagueDraft;
  season: SeasonDraft;
  divisions: DivisionDraft[];
}

export const DEFAULT_TIEBREAKERS: TiebreakerCode[] = [...DEFAULT_DIVISION_TIEBREAKERS];

export const TIEBREAKER_LABELS: Record<TiebreakerCode, string> = {
  wins: "Wins (most wins is a tiebreaker)",
  head_to_head: "Head-to-head record (result of games between the two tied teams)",
  goal_diff: "Goal differential (goals for minus goals against across season)",
  goals_for: "Goals for (total offensive output; more is better)",
  goals_against: "Goals against (fewer is better; rewards defensive play)",
  coin_flip: "Coin flip (admin confirms manually in the system)"
};

/** Team cap a fresh division card starts with; an emptied Max teams box goes back to it. */
export const DEFAULT_MAX_TEAMS = 10;

/**
 * The first thing wrong with a division card, in plain words, or null.
 * Publish waits until every card reads null; the card shows the sentence
 * under the field it names. Numbers use the kernel ranges, the same ones
 * the API refuses with.
 */
export function divisionDraftProblem(d: DivisionDraft): string | null {
  if (d.name.trim().length === 0) return "Division name is required.";
  if (d.regionId === NEW_REGION && d.regionName.trim().length === 0) return "Region name is required.";
  const number = divisionNumberProblem("maxTeams", d.maxTeams) ?? validateDivisionGameRules(d.gameRules);
  if (number) return number;
  if (d.ageRangeMin !== null && d.ageRangeMax !== null && d.ageRangeMax < d.ageRangeMin) {
    return "Max age must be at least min age.";
  }
  return null;
}

export function emptyDivision(uid: string): DivisionDraft {
  const r = defaultDivisionRules();
  return {
    uid,
    name: "",
    tier: "A",
    regionId: null,
    regionName: "",
    genderEligibility: "open",
    ageGroupId: null,
    ageRangeMin: r.ageRange.min,
    ageRangeMax: r.ageRange.max,
    ageGroupLabel: r.ageRange.label,
    maxTeams: DEFAULT_MAX_TEAMS,
    gameRules: r.gameRules,
    tiebreakers: r.tiebreakers,
    points: pointsRuleForm(r.pointsRule),
    playoffConfig: r.playoffConfig
  };
}

/**
 * A new card with every setting of `source` and no name (PPHL letter
 * item 5: "Copy Previous Selections"). Deep copy: editing the copy never
 * changes the source. `copiedFrom` is the hint label, e.g. "Division 1".
 */
export function copyDivisionDraft(source: DivisionDraft, uid: string, copiedFrom?: string): DivisionDraft {
  // The draft keeps points as form strings, so they are copied below and
  // the kernel copy only carries the structured parts.
  const rules = copyDivisionRules(
    {
      gameRules: source.gameRules,
      tiebreakers: source.tiebreakers,
      pointsRule: DEFAULT_POINTS_RULE,
      ageRange: { min: source.ageRangeMin, max: source.ageRangeMax, label: source.ageGroupLabel },
      playoffConfig: source.playoffConfig
    },
    { keepPlayoffDates: true }
  );
  return {
    uid,
    ...(copiedFrom ? { copiedFrom } : {}),
    name: "",
    tier: source.tier,
    regionId: source.regionId,
    regionName: source.regionName,
    genderEligibility: source.genderEligibility,
    ageGroupId: source.ageGroupId,
    ageRangeMin: rules.ageRange.min,
    ageRangeMax: rules.ageRange.max,
    ageGroupLabel: rules.ageRange.label,
    maxTeams: source.maxTeams,
    gameRules: rules.gameRules,
    tiebreakers: rules.tiebreakers,
    points: { ...(source.points ?? pointsRuleForm(null)) },
    playoffConfig: rules.playoffConfig
  };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
