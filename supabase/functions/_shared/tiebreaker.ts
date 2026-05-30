/**
 * Deterministic N-way tiebreaker — pure computation.
 *
 * ====================================================================
 *  CANONICAL SOURCE: packages/scheduler-core/src/tiebreaker.ts
 *  This is a Deno-runtime mirror. Update both files in the same PR.
 *
 *  The 3-way circular H2H skip (pain #5) is implemented here AND
 *  proven by Z3 in supabase/functions/scheduler-verify. The two
 *  implementations must agree.
 * ====================================================================
 */

export type TiebreakerRule =
  | "head_to_head"
  | "wins"
  | "goal_diff"
  | "away_goals"
  | "home_goals"
  | "goals_for"
  | "goals_against";

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

export type H2HProvider = (
  group: string[],
) => Record<string, { points: number; goalDiff: number }>;

export interface RankedTeam {
  teamId: string;
  rank: number;
  resolvedBy: "points" | TiebreakerRule | "teamId";
  note?: string;
}

const HIGHER_IS_BETTER: Record<TiebreakerRule, boolean> = {
  head_to_head: true,
  wins: true,
  goal_diff: true,
  away_goals: true,
  home_goals: true,
  goals_for: true,
  goals_against: false,
};

function metricFor(
  s: TeamStanding,
  rule: Exclude<TiebreakerRule, "head_to_head">,
): number {
  switch (rule) {
    case "wins": return s.wins;
    case "goal_diff": return s.goalDiff;
    case "away_goals": return s.awayGoals;
    case "home_goals": return s.homeGoals;
    case "goals_for": return s.goalsFor;
    case "goals_against": return s.goalsAgainst;
  }
}

function partition(
  group: TeamStanding[],
  value: (s: TeamStanding) => number,
  higherIsBetter: boolean,
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

function breakTie(
  group: TeamStanding[],
  rules: TiebreakerRule[],
  h2h: H2HProvider | undefined,
  carriedNote: string | undefined,
): Array<{ team: TeamStanding; resolvedBy: RankedTeam["resolvedBy"]; note?: string }> {
  if (group.length === 1) {
    return [{ team: group[0]!, resolvedBy: "points", note: carriedNote }];
  }
  const rule = rules[0];
  const rest = rules.slice(1);
  if (rule === undefined) {
    return [...group]
      .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
      .map((team) => ({
        team,
        resolvedBy: "teamId" as const,
        note: carriedNote ?? "all tiebreakers exhausted — ordered by team id",
      }));
  }

  if (rule === "head_to_head") {
    const ids = group.map((s) => s.teamId);
    const records = h2h ? h2h(ids) : undefined;
    if (!records) return breakTie(group, rest, h2h, carriedNote);
    const buckets = partition(group, (s) => records[s.teamId]?.points ?? 0, true);
    const fullySeparated = buckets.every((b) => b.length === 1);
    if (group.length >= 3 && !fullySeparated) {
      const note = `${group.length}-way H2H tie — H2H inconclusive, fell back to ${rest[0] ?? "team id"}`;
      return breakTie(group, rest, h2h, note);
    }
    return buckets.flatMap((bucket) =>
      bucket.length === 1
        ? [{ team: bucket[0]!, resolvedBy: "head_to_head" as const, note: carriedNote }]
        : breakTie(bucket, rest, h2h, carriedNote)
    );
  }

  const buckets = partition(group, (s) => metricFor(s, rule), HIGHER_IS_BETTER[rule]);
  if (buckets.length === 1) return breakTie(group, rest, h2h, carriedNote);
  return buckets.flatMap((bucket) =>
    bucket.length === 1
      ? [{ team: bucket[0]!, resolvedBy: rule, note: carriedNote }]
      : breakTie(bucket, rest, h2h, carriedNote)
  );
}

export function rankStandings(
  standings: TeamStanding[],
  options: { ruleset: TiebreakerRule[]; h2h?: H2HProvider },
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
    note: entry.note,
  }));
}
