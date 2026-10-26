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
  parseTiebreakers,
  rankTalliesByBucket,
  resolvePointsRule,
  tallyStandings,
  type PointsRule,
  type StandingsGame,
  type StandingsTiebreaker
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

export interface AttendanceResult {
  gameId: string;
  /** Rows added from the two lineups (check-in rows already there stay). */
  rowsAdded: number;
  dressed: number;
  scratched: number;
}

/**
 * Who dressed for the game (FR-3.5.4): each team's locked lineup becomes
 * game_attendance rows, starters and bench "present", scratches
 * "scratched". A row the scorekeeper already checked in (a guest, a late
 * arrival) is kept as it is. Idempotent. Games played come from these
 * rows (projectGameStats), so a player who dressed but did not score
 * still gets the game.
 */
export async function recordAttendanceFromLineups(exec: Exec, gameId: string): Promise<AttendanceResult> {
  const lineups = await exec
    .select({ teamId: schema.gameLineups.teamId, lineup: schema.gameLineups.lineup })
    .from(schema.gameLineups)
    .where(eq(schema.gameLineups.gameId, gameId));
  const rows: Array<{ gameId: string; teamId: string; personId: string; status: string; jerseyNumberUsed: number | null }> = [];
  const seen = new Set<string>();
  const jersey = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : NaN;
    return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
  };
  for (const l of lineups) {
    const lu = (l.lineup ?? {}) as {
      starters?: Array<{ personId?: string; jerseyNumber?: unknown }>;
      bench?: Array<{ personId?: string; jerseyNumber?: unknown }>;
      scratches?: Array<{ personId?: string }>;
    };
    for (const p of [...(lu.starters ?? []), ...(lu.bench ?? [])]) {
      if (!p.personId || seen.has(p.personId)) continue;
      seen.add(p.personId);
      rows.push({ gameId, teamId: l.teamId, personId: p.personId, status: "present", jerseyNumberUsed: jersey(p.jerseyNumber) });
    }
    for (const p of lu.scratches ?? []) {
      if (!p.personId || seen.has(p.personId)) continue;
      seen.add(p.personId);
      rows.push({ gameId, teamId: l.teamId, personId: p.personId, status: "scratched", jerseyNumberUsed: null });
    }
  }
  let added = 0;
  if (rows.length) {
    const inserted = await exec
      .insert(schema.gameAttendance)
      .values(rows)
      .onConflictDoNothing({ target: [schema.gameAttendance.gameId, schema.gameAttendance.personId] })
      .returning({ id: schema.gameAttendance.id });
    added = inserted.length;
  }
  const result = {
    gameId,
    rowsAdded: added,
    dressed: rows.filter((r) => r.status === "present").length,
    scratched: rows.filter((r) => r.status === "scratched").length
  };
  log.log(`recordAttendanceFromLineups game=${gameId} lineups=${lineups.length} added=${added} dressed=${result.dressed} scratched=${result.scratched}`);
  return result;
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

  // Everyone who dressed played the game, scoring or not (FR-3.5.4):
  // attendance rows (lineups, check-ins) add a zero line for them.
  const dressed = await exec
    .select({ personId: schema.gameAttendance.personId, teamId: schema.gameAttendance.teamId })
    .from(schema.gameAttendance)
    .where(
      and(
        eq(schema.gameAttendance.gameId, gameId),
        inArray(schema.gameAttendance.status, ["present", "late", "sub"])
      )
    );
  const withEvents = new Set(personStats.map((p) => p.personId));
  for (const d of dressed) {
    if (withEvents.has(d.personId)) continue;
    withEvents.add(d.personId);
    personStats.push({ personId: d.personId, teamId: d.teamId, core: {}, extended: {} } as (typeof personStats)[number]);
  }

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
  /** The request override, or the default; per-division rules in `divisionRules`. */
  pointsRule: PointsRule;
  pointsRuleSource: "default" | "request" | "division" | "season";
  divisionRules: Record<string, { pointsRule: PointsRule; source: string; tiebreakers: string[] }>;
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
  // A request body may pass a rule for the whole league (manual Recompute
  // API). Otherwise each division's stored rule applies (FR-3.13.1):
  // division rule_set_overrides.pointsRule, else season config.pointsRule,
  // else the default. Tie-breaks follow the division's org-setup order.
  const pointsRule: PointsRule = { ...DEFAULT_POINTS_RULE, ...stripUndefined(override ?? {}) };
  const divisionRows = await tx
    .select({
      id: schema.divisions.id,
      rules: schema.divisions.ruleSetOverrides,
      seasonConfig: schema.seasons.config
    })
    .from(schema.divisions)
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
    .where(eq(schema.seasons.leagueId, leagueId));
  const perDivision = new Map<string, { rule: PointsRule; source: "division" | "season" | "default" | "request"; tiebreakers: StandingsTiebreaker[] }>();
  for (const d of divisionRows) {
    const r = resolvePointsRule(d.seasonConfig, d.rules);
    perDivision.set(d.id, {
      rule: hasOverride ? pointsRule : r.rule,
      source: hasOverride ? "request" : r.source,
      tiebreakers: parseTiebreakers((d.rules as { tiebreakers?: unknown } | null)?.tiebreakers)
    });
  }
  const ruleFor = (bucket: string | null): PointsRule => (bucket ? perDivision.get(bucket)?.rule : undefined) ?? pointsRule;

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

  const standingsGames: StandingsGame[] = games.map((g) => {
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
  });
  const ranked = rankTalliesByBucket(tallyStandings(standingsGames, ruleFor), {
    tiebreakers: (bucket) => (bucket ? perDivision.get(bucket)?.tiebreakers : undefined) ?? [],
    games: standingsGames,
    rules: ruleFor
  });

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
        method: ["points", ...((t.bucket ? perDivision.get(t.bucket)?.tiebreakers : undefined)?.length
          ? perDivision.get(t.bucket!)!.tiebreakers
          : ["goal_diff", "goals_for"])].join(","),
        pointsRule: ruleFor(t.bucket),
        pointsRuleSource: (t.bucket ? perDivision.get(t.bucket)?.source : undefined) ?? (hasOverride ? "request" : "default"),
        tiedAfterTiebreakers: t.tiedAfterTiebreakers
      }
    });
  }
  log.log(
    `recomputeLeagueStandings league=${leagueId} games=${games.length} rowsWritten=${ranked.length} override=${hasOverride} divisionRules=${[...perDivision.values()].filter((d) => d.source === "division").length}`
  );
  return {
    leagueId,
    teamsRanked: ranked.length,
    gamesCounted: games.length,
    pointsRule,
    pointsRuleSource: hasOverride ? "request" : "default",
    divisionRules: Object.fromEntries(
      [...perDivision.entries()].map(([id, d]) => [id, { pointsRule: d.rule, source: d.source, tiebreakers: d.tiebreakers }])
    )
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
