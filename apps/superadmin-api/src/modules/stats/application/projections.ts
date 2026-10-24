import { Logger } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  ApplicationError,
  DEFAULT_POINTS_RULE,
  NotFoundError,
  STANDINGS_GAME_STATUSES,
  isGameEnding,
  rankTalliesByBucket,
  tallyStandings,
  type PointsRule
} from "@sportspulse/kernel";
import type { StatsRepository } from "../domain/repositories/stats.repository";
import { DrizzleStatsRepository } from "../infrastructure/repositories/drizzle-stats.repository";
import { reducerForSport } from "../domain/reducers/reducer";

/**
 * Stat-line and standings projections as plain functions over a database
 * executor, so the finalize command can run them in the same transaction
 * as the status change (SCH-17), and the manual "Project stats" /
 * "Recompute" buttons reuse the exact same code.
 *
 * Both are derived from server data only: stat lines from the game's
 * append-only event log, standings from the stored scores and endings of
 * the league's completed and forfeited games. Nothing comes from the
 * client except which game or league to rebuild.
 */

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Exec = Database | Tx;

const log = new Logger("StatsProjections");

/** The stats repository bound to a transaction (or the pool). */
function statsRepo(exec: Exec): StatsRepository {
  // DrizzleStatsRepository only uses select/insert/update/delete, which a
  // transaction exposes with the same signatures.
  return new DrizzleStatsRepository(exec as unknown as Database);
}

export interface ProjectionResult {
  gameId: string;
  linesWritten: number;
  sportCode: string;
  seasonId: string | null;
}

/**
 * Rebuild the game's stat lines from its event log. Idempotent: deletes
 * the game's lines and writes them again.
 */
export async function projectGameStats(
  exec: Exec,
  gameId: string,
  opts: { allowInProgress?: boolean } = {}
): Promise<ProjectionResult> {
  const [game] = await exec
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .limit(1);
  if (!game) throw new NotFoundError("Game", gameId);

  if (!opts.allowInProgress && game.status !== "completed") {
    throw new ApplicationError(
      "GAME_NOT_FINAL",
      "Stats projection requires game to be finalized (or pass allowInProgress=true)"
    );
  }

  // games.season_id first; the division's season for older rows.
  let seasonId: string | null = game.seasonId;
  if (!seasonId && game.divisionId) {
    const [div] = await exec
      .select({ seasonId: schema.divisions.seasonId })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, game.divisionId))
      .limit(1);
    seasonId = div?.seasonId ?? null;
  }

  const events = await exec
    .select()
    .from(schema.gameEvents)
    .where(eq(schema.gameEvents.gameId, gameId));
  events.sort(
    (a, b) =>
      a.tsUtc.getTime() - b.tsUtc.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
  );

  const personStats = reducerForSport(game.sportCode).fold(
    events.map((e) => ({
      eventType: e.eventType,
      teamId: e.teamId,
      primaryPersonId: e.primaryPersonId,
      secondaryPersonIds: (e.secondaryPersonIds as string[]) ?? [],
      attributes: (e.attributes as Record<string, unknown>) ?? {}
    }))
  );

  const repo = statsRepo(exec);
  await repo.deleteStatLinesForGame(gameId);
  if (personStats.length > 0) {
    await repo.upsertStatLines(
      personStats.map((p) => ({
        gameId,
        personId: p.personId,
        // Every attributed hockey event carries its team (validated on
        // append); the home-team fallback only applies to legacy rows.
        teamId: p.teamId ?? game.homeTeamId,
        sportCode: game.sportCode,
        seasonId,
        leagueId: game.leagueId,
        divisionId: game.divisionId,
        gpIncrement: 1,
        core: p.core,
        extended: p.extended
      }))
    );
  }
  log.log(
    `projectGameStats game=${gameId} events=${events.length} linesWritten=${personStats.length} season=${seasonId ?? "none"}`
  );
  return { gameId, linesWritten: personStats.length, sportCode: game.sportCode, seasonId };
}

export interface StandingsResult {
  leagueId: string;
  teamsRanked: number;
  gamesCounted: number;
  pointsRule: PointsRule;
  pointsRuleSource: "default" | "request";
}

/**
 * Rebuild a league's standings from its completed and forfeited games.
 * Takes a per-league transaction-scoped advisory lock first, so two games
 * finalized at the same moment cannot overwrite each other's standings
 * with a stale read: the second waits, then reads both results. Call it
 * inside a transaction (the lock is released at commit).
 */
export async function recomputeLeagueStandings(
  tx: Tx,
  leagueId: string,
  override?: Partial<PointsRule>
): Promise<StandingsResult> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`standings:${leagueId}`}))`);

  const [league] = await tx
    .select({ id: schema.leagues.id })
    .from(schema.leagues)
    .where(eq(schema.leagues.id, leagueId))
    .limit(1);
  if (!league) throw new NotFoundError("League", leagueId);

  const hasOverride = !!override && Object.values(override).some((v) => v !== undefined);
  // No division stores a points rule yet (benchmark C.1 R1); a request
  // body may still pass one (the manual Recompute API).
  const pointsRule: PointsRule = { ...DEFAULT_POINTS_RULE, ...stripUndefined(override ?? {}) };

  const games = await tx
    .select({
      status: schema.games.status,
      homeTeamId: schema.games.homeTeamId,
      awayTeamId: schema.games.awayTeamId,
      divisionId: schema.games.divisionId,
      homeScore: schema.games.homeScore,
      awayScore: schema.games.awayScore,
      metadata: schema.games.metadata
    })
    .from(schema.games)
    .where(
      and(
        eq(schema.games.leagueId, leagueId),
        inArray(schema.games.status, [...STANDINGS_GAME_STATUSES])
      )
    );

  // Mid-season division shift without a reset (0052): games a team
  // played under its previous entry count toward the division it plays
  // in now. Map (team, old division) -> new division, following chains.
  const carried = await tx
    .select({
      teamId: schema.divisionTeamEntries.teamId,
      toDivisionId: schema.divisionTeamEntries.divisionId,
      fromDivisionId: sql<string>`prev.division_id`
    })
    .from(schema.divisionTeamEntries)
    .innerJoin(
      sql`division_team_entries prev`,
      sql`prev.id = ${schema.divisionTeamEntries.previousEntryId}`
    )
    .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
    .where(
      and(
        eq(schema.seasons.leagueId, leagueId),
        eq(schema.divisionTeamEntries.carryStandings, true),
        sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('rejected','withdrawn','disqualified','moved')`
      )
    );
  const remap = new Map<string, string>();
  for (const c of carried) remap.set(`${c.teamId}:${c.fromDivisionId}`, c.toDivisionId);
  const bucketFor = (teamId: string, divisionId: string | null): string | null => {
    let d = divisionId;
    for (let hops = 0; d && hops < 10; hops++) {
      const next = remap.get(`${teamId}:${d}`);
      if (!next || next === d) break;
      d = next;
    }
    return d;
  };

  const ranked = rankTalliesByBucket(
    tallyStandings(
      games.map((g) => {
        const endedIn = (g.metadata as Record<string, unknown> | null)?.endedIn;
        return {
          status: g.status,
          homeTeamId: g.homeTeamId,
          awayTeamId: g.awayTeamId,
          homeBucket: bucketFor(g.homeTeamId, g.divisionId),
          awayBucket: bucketFor(g.awayTeamId, g.divisionId),
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          endedIn: isGameEnding(endedIn) ? endedIn : null
        };
      }),
      pointsRule
    )
  );

  const repo = statsRepo(tx);
  await repo.deleteStandingsForLeague(leagueId);
  for (const t of ranked) {
    await repo.upsertStanding({
      leagueId,
      divisionId: t.bucket,
      teamId: t.teamId,
      gp: t.gp,
      w: t.w,
      l: t.l,
      t: t.t,
      otl: t.otl,
      points: t.points,
      gf: t.gf,
      ga: t.ga,
      gd: t.gf - t.ga,
      rank: t.rank,
      tiebreakers: {
        method: "points,gd,gf",
        pointsRule,
        pointsRuleSource: hasOverride ? "request" : "default"
      }
    });
  }
  log.log(
    `recomputeLeagueStandings league=${leagueId} games=${games.length} rowsWritten=${ranked.length} rule=${JSON.stringify(pointsRule)}`
  );
  return {
    leagueId,
    teamsRanked: ranked.length,
    gamesCounted: games.length,
    pointsRule,
    pointsRuleSource: hasOverride ? "request" : "default"
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
