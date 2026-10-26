/**
 * Game results and standings arithmetic (UC-12 finalize, UC-13 standings).
 *
 * Pure functions. The API's finalize command and the standings recompute
 * both call these, so the rule lives in one place and has unit tests
 * (game-results.test.ts).
 *
 * Points per result come from the division (rule_set_overrides.pointsRule),
 * else the season (config.pointsRule), else DEFAULT_POINTS_RULE
 * (FR-3.13.1). Ties on points are broken in the order set in org setup
 * (rule_set_overrides.tiebreakers), else goal difference then goals for.
 * Not done: goal-differential caps (benchmark C.1 R6).
 */

/** How a game ended. Drives OT-loss points (benchmark C.1 R2). */
export const GAME_ENDINGS = ["regulation", "overtime", "shootout"] as const;
export type GameEnding = (typeof GAME_ENDINGS)[number];

export const GAME_ENDING_LABELS: Record<GameEnding, string> = {
  regulation: "Regulation",
  overtime: "Overtime",
  shootout: "Shootout"
};

export function isGameEnding(v: unknown): v is GameEnding {
  return typeof v === "string" && (GAME_ENDINGS as readonly string[]).includes(v);
}

/** Points per result. A tie is a real outcome (no shootout, curfew). */
export interface PointsRule {
  win: number;
  overtimeWin: number;
  loss: number;
  overtimeLoss: number;
  tie: number;
}

/**
 * Applied when the division stores no points rule. No division stores one
 * today (benchmark C.1 R1), so this is what every league gets: 2 for a win
 * (regulation, overtime or shootout), 1 for a tie, 1 for an overtime or
 * shootout loss, 0 for a regulation loss. Same numbers the recompute used
 * before (ppw 2 / ppt 1 / ppotl 1 / ppl 0).
 */
export const DEFAULT_POINTS_RULE: PointsRule = {
  win: 2,
  overtimeWin: 2,
  loss: 0,
  overtimeLoss: 1,
  tie: 1
};

/** Labels for the five numbers, word for word on every screen. */
export const POINTS_RULE_LABELS: Record<keyof PointsRule, string> = {
  win: "Points per win",
  overtimeWin: "Points per overtime or shootout win",
  loss: "Points per loss",
  overtimeLoss: "Points per overtime or shootout loss",
  tie: "Points per tie"
};

const POINTS_KEYS = Object.keys(DEFAULT_POINTS_RULE) as Array<keyof PointsRule>;

/**
 * The valid part of a stored points rule: whole numbers 0 to 10 only.
 * Anything else is dropped (never guessed), so the next level applies.
 */
export function parsePointsRule(raw: unknown): Partial<PointsRule> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<PointsRule> = {};
  for (const k of POINTS_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10) out[k] = v;
  }
  return out;
}

/** Problem with a points rule an admin typed, or null when it is fine. */
export function pointsRuleProblem(rule: Partial<Record<keyof PointsRule, unknown>>): string | null {
  for (const k of POINTS_KEYS) {
    const v = rule[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10) {
      return `${POINTS_RULE_LABELS[k]} must be a whole number from 0 to 10.`;
    }
  }
  return null;
}

/** Division rule over season rule over the default; says where it came from. */
export function resolvePointsRule(
  seasonConfig: unknown,
  divisionRules: unknown
): { rule: PointsRule; source: "division" | "season" | "default" } {
  const season = parsePointsRule((seasonConfig as { pointsRule?: unknown } | null)?.pointsRule);
  const division = parsePointsRule((divisionRules as { pointsRule?: unknown } | null)?.pointsRule);
  const source = Object.keys(division).length ? "division" : Object.keys(season).length ? "season" : "default";
  return { rule: { ...DEFAULT_POINTS_RULE, ...season, ...division }, source };
}

/** Tie-break steps an admin can order in org setup (after points). */
export const STANDINGS_TIEBREAKERS = [
  "wins",
  "head_to_head",
  "goal_diff",
  "goals_for",
  "goals_against",
  "coin_flip"
] as const;
export type StandingsTiebreaker = (typeof STANDINGS_TIEBREAKERS)[number];

/** Used when a division has no order set (the order standings always used). */
export const DEFAULT_STANDINGS_TIEBREAKERS: StandingsTiebreaker[] = ["goal_diff", "goals_for"];

export function parseTiebreakers(raw: unknown): StandingsTiebreaker[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter((c): c is StandingsTiebreaker => {
    if (typeof c !== "string" || seen.has(c)) return false;
    seen.add(c);
    return (STANDINGS_TIEBREAKERS as readonly string[]).includes(c);
  });
}

/** Game statuses that count in standings. */
export const STANDINGS_GAME_STATUSES = ["completed", "forfeited"] as const;

export interface StandingsGame {
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Standings bucket each side counts toward (division id), null = league level. */
  homeBucket: string | null;
  awayBucket: string | null;
  homeScore: number;
  awayScore: number;
  /** null = not recorded (games finalized before 25 Oct 2026); counted as regulation. */
  endedIn: GameEnding | null;
}

export interface StandingsTally {
  teamId: string;
  bucket: string | null;
  gp: number;
  w: number;
  l: number;
  t: number;
  otl: number;
  gf: number;
  ga: number;
  points: number;
}

/**
 * One tally per (bucket, team) from the league's games. Only completed and
 * forfeited games count. A forfeit always counts as a regulation result.
 */
export function tallyStandings(
  games: readonly StandingsGame[],
  rules: PointsRule | ((bucket: string | null) => PointsRule) = DEFAULT_POINTS_RULE
): StandingsTally[] {
  const ruleFor = typeof rules === "function" ? rules : () => rules;
  const tallies = new Map<string, StandingsTally>();
  const get = (teamId: string, bucket: string | null): StandingsTally => {
    const key = `${bucket ?? "_league_"}:${teamId}`;
    let t = tallies.get(key);
    if (!t) {
      t = { teamId, bucket, gp: 0, w: 0, l: 0, t: 0, otl: 0, gf: 0, ga: 0, points: 0 };
      tallies.set(key, t);
    }
    return t;
  };

  for (const g of games) {
    if (!(STANDINGS_GAME_STATUSES as readonly string[]).includes(g.status)) continue;
    const home = get(g.homeTeamId, g.homeBucket);
    const away = get(g.awayTeamId, g.awayBucket);
    home.gp += 1;
    away.gp += 1;
    home.gf += g.homeScore;
    home.ga += g.awayScore;
    away.gf += g.awayScore;
    away.ga += g.homeScore;

    // Each side scores by its own division's rule.
    const homeRule = ruleFor(g.homeBucket);
    const awayRule = ruleFor(g.awayBucket);
    if (g.homeScore === g.awayScore) {
      home.t += 1;
      away.t += 1;
      home.points += homeRule.tie;
      away.points += awayRule.tie;
      continue;
    }
    const extraTime =
      g.status !== "forfeited" && (g.endedIn === "overtime" || g.endedIn === "shootout");
    const homeWon = g.homeScore > g.awayScore;
    const [winner, loser] = homeWon ? [home, away] : [away, home];
    const [winRule, loseRule] = homeWon ? [homeRule, awayRule] : [awayRule, homeRule];
    winner.w += 1;
    winner.points += extraTime ? winRule.overtimeWin : winRule.win;
    if (extraTime) {
      loser.otl += 1;
      loser.points += loseRule.overtimeLoss;
    } else {
      loser.l += 1;
      loser.points += loseRule.loss;
    }
  }
  return [...tallies.values()];
}

export interface RankedTally extends StandingsTally {
  rank: number;
  /** True when only a coin flip (or nothing) separates this team from another. */
  tiedAfterTiebreakers: boolean;
}

export interface RankOptions {
  /** Tie-break order per bucket after points; default goal difference, goals for. */
  tiebreakers?: (bucket: string | null) => readonly StandingsTiebreaker[];
  /** Games for head-to-head, with the same rule per bucket as the tally. */
  games?: readonly StandingsGame[];
  rules?: (bucket: string | null) => PointsRule;
}

/**
 * Rank inside each bucket: points first, then the bucket's tie-break order.
 * Each step splits only the teams still tied. Head-to-head is the points
 * the tied teams took from games among themselves. A coin flip cannot be
 * computed: teams still tied keep a stable order (team id) and are marked
 * tiedAfterTiebreakers so an admin settles it.
 */
export function rankTalliesByBucket(
  tallies: readonly StandingsTally[],
  opts: RankOptions = {}
): RankedTally[] {
  const buckets = new Map<string, StandingsTally[]>();
  for (const t of tallies) {
    const key = t.bucket ?? "_league_";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }
  const out: RankedTally[] = [];
  for (const arr of buckets.values()) {
    const bucket = arr[0]!.bucket;
    const order = opts.tiebreakers?.(bucket) ?? DEFAULT_STANDINGS_TIEBREAKERS;
    const steps = order.length ? order : DEFAULT_STANDINGS_TIEBREAKERS;
    const rule = opts.rules?.(bucket) ?? DEFAULT_POINTS_RULE;
    const h2h = (group: StandingsTally[]): Map<string, number> => {
      const ids = new Set(group.map((t) => t.teamId));
      const pts = new Map<string, number>(group.map((t) => [t.teamId, 0]));
      for (const g of opts.games ?? []) {
        if (!(STANDINGS_GAME_STATUSES as readonly string[]).includes(g.status)) continue;
        if (!ids.has(g.homeTeamId) || !ids.has(g.awayTeamId)) continue;
        if (g.homeBucket !== bucket || g.awayBucket !== bucket) continue;
        const [one] = tallyStandings([g], rule).filter((x) => x.teamId === g.homeTeamId);
        const [two] = tallyStandings([g], rule).filter((x) => x.teamId === g.awayTeamId);
        pts.set(g.homeTeamId, pts.get(g.homeTeamId)! + (one?.points ?? 0));
        pts.set(g.awayTeamId, pts.get(g.awayTeamId)! + (two?.points ?? 0));
      }
      return pts;
    };
    const keyOf = (step: StandingsTiebreaker | "points", group: StandingsTally[]) => {
      if (step === "head_to_head") {
        const m = h2h(group);
        return (t: StandingsTally) => m.get(t.teamId) ?? 0;
      }
      return (t: StandingsTally) =>
        step === "points" ? t.points
        : step === "wins" ? t.w
        : step === "goal_diff" ? t.gf - t.ga
        : step === "goals_for" ? t.gf
        : step === "goals_against" ? -t.ga
        : 0; // coin_flip: nothing to compute
    };
    const sorted: Array<{ t: StandingsTally; tied: boolean }> = [];
    const split = (group: StandingsTally[], i: number) => {
      if (group.length === 1) { sorted.push({ t: group[0]!, tied: false }); return; }
      const allSteps: Array<StandingsTiebreaker | "points"> = ["points", ...steps];
      if (i >= allSteps.length || allSteps[i] === "coin_flip") {
        for (const t of [...group].sort((a, b) => (a.teamId < b.teamId ? -1 : 1))) sorted.push({ t, tied: true });
        return;
      }
      const key = keyOf(allSteps[i]!, group);
      const byKey = new Map<number, StandingsTally[]>();
      for (const t of group) {
        const k = key(t);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(t);
      }
      for (const k of [...byKey.keys()].sort((a, b) => b - a)) split(byKey.get(k)!, i + 1);
    };
    split(arr, 0);
    sorted.forEach(({ t, tied }, i) => out.push({ ...t, rank: i + 1, tiedAfterTiebreakers: tied }));
  }
  return out;
}

/** A team entered in a division (a live division_team_entries row). */
export interface EnteredTeam {
  divisionId: string;
  teamId: string;
  teamName?: string | null;
}

/**
 * Standings list every entered team from day one (F-4), as SportsEngine
 * does. Stored standings only hold teams with a finalized game; each
 * entered team without a row is added on read with zeros, ranked after
 * the division's teams with games. They are all tied at zero, so they
 * follow in name order. `zero` builds the row; nothing is written.
 */
export function withEnteredTeams<T extends { divisionId: string | null; teamId: string; rank: number | null }>(
  rows: readonly T[],
  entered: readonly EnteredTeam[],
  zero: (team: EnteredTeam, rank: number) => T
): T[] {
  const out = [...rows];
  const byDivision = new Map<string, EnteredTeam[]>();
  for (const e of entered) {
    if (!byDivision.has(e.divisionId)) byDivision.set(e.divisionId, []);
    byDivision.get(e.divisionId)!.push(e);
  }
  for (const [divisionId, teams] of byDivision) {
    const listed = rows.filter((r) => r.divisionId === divisionId);
    const have = new Set(listed.map((r) => r.teamId));
    let rank = Math.max(listed.length, ...listed.map((r) => r.rank ?? 0));
    const seen = new Set<string>();
    const missing = teams
      .filter((t) => !have.has(t.teamId) && !seen.has(t.teamId) && seen.add(t.teamId))
      .sort((a, b) => (a.teamName ?? "").localeCompare(b.teamName ?? "") || (a.teamId < b.teamId ? -1 : 1));
    for (const t of missing) out.push(zero(t, ++rank));
  }
  return out;
}

export interface FinalResultInput {
  homeScore: number;
  awayScore: number;
  /** What the scorekeeper says; null when not given. */
  endedIn: GameEnding | null;
  /** Goal events in the log per side, plus goals logged without a team. */
  goalEvents: { home: number; away: number; withoutTeam: number };
}

export type FinalResultVerdict =
  | { ok: true; endedIn: GameEnding | null }
  | { ok: false; code: string; message: string };

/**
 * May this score be finalized? The score must agree with the goal events
 * when any were logged (a shootout adds one goal to the winner's score),
 * and a decided game must say how it ended so standings can tell an
 * overtime loss from a regulation loss.
 */
export function checkFinalResult(input: FinalResultInput): FinalResultVerdict {
  const { homeScore, awayScore, endedIn, goalEvents } = input;
  const decided = homeScore !== awayScore;

  if (decided && endedIn === null) {
    return {
      ok: false,
      code: "FINAL_ENDING_REQUIRED",
      message: "Say how the game ended: regulation, overtime or shootout."
    };
  }
  if (!decided && endedIn === "shootout") {
    return {
      ok: false,
      code: "FINAL_SHOOTOUT_TIED",
      message:
        "A shootout always has a winner. Add one goal to the shootout winner's score, then finalize."
    };
  }
  if (goalEvents.withoutTeam > 0) {
    return {
      ok: false,
      code: "FINAL_GOAL_WITHOUT_TEAM",
      message: `${goalEvents.withoutTeam} goal${goalEvents.withoutTeam === 1 ? "" : "s"} in the event log ha${goalEvents.withoutTeam === 1 ? "s" : "ve"} no team. Log a corrected goal for the right team before finalizing.`
    };
  }
  const logged = goalEvents.home + goalEvents.away;
  if (logged > 0) {
    let expectHome = goalEvents.home;
    let expectAway = goalEvents.away;
    if (endedIn === "shootout") {
      if (homeScore > awayScore) expectHome += 1;
      else expectAway += 1;
    }
    if (expectHome !== homeScore || expectAway !== awayScore) {
      const so = endedIn === "shootout" ? " (plus one shootout goal for the winner)" : "";
      return {
        ok: false,
        code: "FINAL_SCORE_MISMATCH",
        message:
          `The score is home ${homeScore}, away ${awayScore}, but the event log has ` +
          `${goalEvents.home} home and ${goalEvents.away} away goal${goalEvents.away === 1 ? "" : "s"}${so}. ` +
          "Fix the score or the event log, then finalize."
      };
    }
  }
  return { ok: true, endedIn };
}
