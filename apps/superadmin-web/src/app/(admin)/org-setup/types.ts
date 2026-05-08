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
export type ClockType = "stopped" | "running";
export type BodyChecking =
  | "permitted"
  | "not_permitted_penalty"
  | "not_permitted_no_penalty";
export type SeriesFormat =
  | "best_of_1"
  | "best_of_3"
  | "best_of_5"
  | "best_of_7";
export type BracketType = "single_elim" | "double_elim" | "round_robin";
export type HomeIceRule = "higher_seed_first" | "alternating" | "neutral";
export type TiebreakerCode =
  | "wins"
  | "head_to_head"
  | "goal_diff"
  | "goals_for"
  | "goals_against"
  | "coin_flip";

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
  registrationOpensAt: string;
  registrationClosesAt: string;
  rosterLockAt: string;
}

export interface GameRules {
  numberOfPeriods: number;
  periodLengthMin: number;
  clockType: ClockType;
  overtimeLengthMin: number;
  bodyChecking: BodyChecking;
  minStartersToStart: number;
  maxPostGamePlayers: number;
}

export interface PlayoffConfig {
  enabled: boolean;
  playoffSpots: number;
  startDate: string;
  endDate: string;
  seriesFormat: SeriesFormat;
  bracketType: BracketType;
  homeIceRule: HomeIceRule;
}

export interface DivisionDraft {
  uid: string; // local-only for the form list
  name: string;
  tier: Tier;
  genderEligibility: Gender;
  ageGroupId: string | null;
  ageRangeMin: number | null;
  ageRangeMax: number | null;
  ageGroupLabel: string;
  maxTeams: number;
  gameRules: GameRules;
  tiebreakers: TiebreakerCode[];
  playoffConfig: PlayoffConfig;
}

export interface WizardState {
  step: WizardStep;
  orgId: string | null;
  league: LeagueDraft;
  season: SeasonDraft;
  divisions: DivisionDraft[];
}

export const DEFAULT_TIEBREAKERS: TiebreakerCode[] = [
  "wins",
  "head_to_head",
  "goal_diff",
  "goals_for",
  "goals_against",
  "coin_flip"
];

export const TIEBREAKER_LABELS: Record<TiebreakerCode, string> = {
  wins: "Wins (most wins is a tiebreaker)",
  head_to_head: "Head-to-head record (result of games between the two tied teams)",
  goal_diff: "Goal differential (goals for minus goals against across season)",
  goals_for: "Goals for (total offensive output — more is better)",
  goals_against: "Goals against (fewer is better — rewards defensive play)",
  coin_flip: "Coin flip (admin confirms manually in the system)"
};

export function emptyDivision(uid: string): DivisionDraft {
  return {
    uid,
    name: "",
    tier: "A",
    genderEligibility: "open",
    ageGroupId: null,
    ageRangeMin: null,
    ageRangeMax: null,
    ageGroupLabel: "Custom age group",
    maxTeams: 10,
    gameRules: {
      numberOfPeriods: 3,
      periodLengthMin: 20,
      clockType: "stopped",
      overtimeLengthMin: 5,
      bodyChecking: "not_permitted_penalty",
      minStartersToStart: 6,
      maxPostGamePlayers: 20
    },
    tiebreakers: [...DEFAULT_TIEBREAKERS],
    playoffConfig: {
      enabled: true,
      playoffSpots: 8,
      startDate: "",
      endDate: "",
      seriesFormat: "best_of_1",
      bracketType: "single_elim",
      homeIceRule: "higher_seed_first"
    }
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
