/**
 * Deterministic N-way tiebreaker resolver (pain #5).
 *
 * The bug this fixes: when three+ teams are tied on head-to-head record,
 * H2H is statistically circular (each won and lost within the group) and
 * cannot rank them. Avario has no defined behaviour here; the documented
 * fix is to recognise the circular tie and fall through to the next rule
 * (away goals → home goals → goal differential → ...).
 *
 * Properties guaranteed:
 *  - Deterministic: identical input → identical output, always. The final
 *    fallback is a stable sort by teamId so there is never an ambiguous
 *    or random ordering.
 *  - Reproducible & auditable: every ranked team carries the rule that
 *    resolved its position and a human-readable note for the trace the
 *    standings UI renders (Anthropic's tiebreaker_trace requirement).
 *  - N-way safe: 2-way, 3-way, 4-way ties all handled by the same
 *    recursive routine; the 3-way H2H skip is a special case of "H2H did
 *    not fully separate the group".
 */

export type TiebreakerRule =
  | "head_to_head"
  | "wins"
  | "goal_diff"
  | "away_goals"
  | "home_goals"
  | "goals_for"
  | "goals_against"; // fewer is better

export interface TeamStanding {
  teamId: string;
  points: number;
  wins: number;
  goalDiff: number;
  goalsFor: number;
  goalsAgainst: number;
  awayGoals: number;
  homeGoals: number;
}

/**
 * Head-to-head provider. Given a tied group, returns each team's record
 * computed over games played ONLY among that group. The caller owns game
 * data and supplies this; the resolver decides whether H2H is conclusive.
 */
export type H2HProvider = (
  group: string[]
) => Record<string, { points: number; goalDiff: number }>;

export interface RankedTeam {
  teamId: string;
  rank: number; // 1-based; tied teams that stayed tied share a rank
  resolvedBy: "points" | TiebreakerRule | "teamId";
  note?: string;
}

export interface RankOptions {
  /** Applied in order, after the primary `points` sort. */
  ruleset: TiebreakerRule[];
  h2h?: H2HProvider;
}

const HIGHER_IS_BETTER: Record<TiebreakerRule, boolean> = {
  head_to_head: true,
  wins: true,
  goal_diff: true,
  away_goals: true,
  home_goals: true,
  goals_for: true,
  goals_against: false
};

function metricFor(s: TeamStanding, rule: Exclude<TiebreakerRule, "head_to_head">): number {
  switch (rule) {
    case "wins":
      return s.wins;
    case "goal_diff":
      return s.goalDiff;
    case "away_goals":
      return s.awayGoals;
    case "home_goals":
      return s.homeGoals;
    case "goals_for":
      return s.goalsFor;
    case "goals_against":
      return s.goalsAgainst;
  }
}

/** Partition a group into buckets of equal `value`, ordered best-first. */
function partition(
  group: TeamStanding[],
  value: (s: TeamStanding) => number,
  higherIsBetter: boolean
): TeamStanding[][] {
  const sorted = [...group].sort((a, b) =>
    higherIsBetter ? value(b) - value(a) : value(a) - value(b)
  );
  const buckets: TeamStanding[][] = [];
  for (const s of sorted) {
    const last = buckets[buckets.length - 1];
    if (last && value(last[0]!) === value(s)) last.push(s);
    else buckets.push([s]);
  }
  return buckets;
}

/**
 * Resolve a tied group by walking the ruleset. Returns the group in ranked
 * order, annotated with which rule resolved each split.
 */
function breakTie(
  group: TeamStanding[],
  rules: TiebreakerRule[],
  h2h: H2HProvider | undefined,
  carriedNote: string | undefined
): Array<{ team: TeamStanding; resolvedBy: RankedTeam["resolvedBy"]; note?: string }> {
  if (group.length === 1) {
    return [{ team: group[0]!, resolvedBy: "points", note: carriedNote }];
  }

  const rule = rules[0];
  const rest = rules.slice(1);
  if (rule === undefined) {
    // Exhausted every rule — stay deterministic with a stable teamId sort.
    return [...group]
      .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
      .map((team) => ({
        team,
        resolvedBy: "teamId" as const,
        note: carriedNote ?? "all tiebreakers exhausted — ordered by team id"
      }));
  }

  if (rule === "head_to_head") {
    const ids = group.map((s) => s.teamId);
    const records = h2h ? h2h(ids) : undefined;
    if (!records) {
      // No H2H data available — skip to the next rule.
      return breakTie(group, rest, h2h, carriedNote);
    }
    const buckets = partition(
      group,
      (s) => records[s.teamId]?.points ?? 0,
      true
    );
    const fullySeparated = buckets.every((b) => b.length === 1);

    if (group.length >= 3 && !fullySeparated) {
      // The circular case the bug is about: 3+ teams tied on H2H record.
      // H2H is irrelevant — fall through to the next rule for the WHOLE
      // group, and say so in the trace.
      const note = `${group.length}-way H2H tie — H2H inconclusive, fell back to ${rest[0] ?? "team id"}`;
      return breakTie(group, rest, h2h, note);
    }

    // 2-way (or a cleanly transitive 3+-way): H2H is informative. Use it,
    // then recurse into any sub-bucket that is still tied.
    return buckets.flatMap((bucket) =>
      bucket.length === 1
        ? [{ team: bucket[0]!, resolvedBy: "head_to_head" as const, note: carriedNote }]
        : breakTie(bucket, rest, h2h, carriedNote)
    );
  }

  const buckets = partition(group, (s) => metricFor(s, rule), HIGHER_IS_BETTER[rule]);
  if (buckets.length === 1) {
    // This rule didn't separate anyone — carry on to the next.
    return breakTie(group, rest, h2h, carriedNote);
  }
  return buckets.flatMap((bucket) =>
    bucket.length === 1
      ? [{ team: bucket[0]!, resolvedBy: rule, note: carriedNote }]
      : breakTie(bucket, rest, h2h, carriedNote)
  );
}

/**
 * Rank a set of teams: primary sort by points, then the configured
 * tiebreaker ruleset for any tied group.
 */
export function rankStandings(
  standings: TeamStanding[],
  options: RankOptions
): RankedTeam[] {
  const pointBuckets = partition(standings, (s) => s.points, true);

  const ordered: Array<{
    team: TeamStanding;
    resolvedBy: RankedTeam["resolvedBy"];
    note?: string;
  }> = [];
  for (const bucket of pointBuckets) {
    if (bucket.length === 1) {
      ordered.push({ team: bucket[0]!, resolvedBy: "points" });
    } else {
      ordered.push(...breakTie(bucket, options.ruleset, options.h2h, undefined));
    }
  }

  return ordered.map((entry, i) => ({
    teamId: entry.team.teamId,
    rank: i + 1,
    resolvedBy: entry.resolvedBy,
    note: entry.note
  }));
}
