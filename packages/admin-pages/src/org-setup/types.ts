import { pointsRuleForm, type PointsRuleForm } from "../divisions/points-rule";
import {
  DEFAULT_DIVISION_TIEBREAKERS,
  DEFAULT_POINTS_RULE,
  copyDivisionRules,
  defaultDivisionRules,
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

export type WizardStep = 1 | 2 | 3 | 4;

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
    maxTeams: 10,
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
