/**
 * Game results and standings arithmetic (UC-12 finalize, UC-13 standings).
 *
 * Pure functions. The API's finalize command and the standings recompute
 * both call these, so the rule lives in one place and has unit tests
 * (game-results.test.ts).
 *
 * What this does NOT do yet (benchmark doc/traceability/benchmark.md C.1):
 * configurable tie-break order (R5), goal-differential caps (R6),
 * head-to-head. Ranking stays points, then goal difference, then goals for.
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
  rule: PointsRule = DEFAULT_POINTS_RULE
): StandingsTally[] {
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

    if (g.homeScore === g.awayScore) {
      home.t += 1;
      away.t += 1;
      home.points += rule.tie;
      away.points += rule.tie;
      continue;
    }
    const extraTime =
      g.status !== "forfeited" && (g.endedIn === "overtime" || g.endedIn === "shootout");
    const [winner, loser] = g.homeScore > g.awayScore ? [home, away] : [away, home];
    winner.w += 1;
    winner.points += extraTime ? rule.overtimeWin : rule.win;
    if (extraTime) {
      loser.otl += 1;
      loser.points += rule.overtimeLoss;
    } else {
      loser.l += 1;
      loser.points += rule.loss;
    }
  }
  return [...tallies.values()];
}

export interface RankedTally extends StandingsTally {
  rank: number;
}

/** Rank inside each bucket: points, then goal difference, then goals for. */
export function rankTalliesByBucket(tallies: readonly StandingsTally[]): RankedTally[] {
  const buckets = new Map<string, StandingsTally[]>();
  for (const t of tallies) {
    const key = t.bucket ?? "_league_";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }
  const out: RankedTally[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gd = b.gf - b.ga - (a.gf - a.ga);
      if (gd !== 0) return gd;
      return b.gf - a.gf;
    });
    arr.forEach((t, i) => out.push({ ...t, rank: i + 1 }));
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
