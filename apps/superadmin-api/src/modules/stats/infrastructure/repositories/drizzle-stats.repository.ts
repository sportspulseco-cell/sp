import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  LeaderboardRow,
  ListStatLinesQuery,
  StandingRow,
  StatLineRow,
  StatsRepository,
  UpsertStatLine
} from "../../domain/repositories/stats.repository";

@Injectable()
export class DrizzleStatsRepository implements StatsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- StatLines ----------

  async listLines(q: ListStatLinesQuery): Promise<Page<StatLineRow>> {
    const cs = [];
    if (q.personId) cs.push(eq(schema.statLines.personId, q.personId));
    if (q.teamId) cs.push(eq(schema.statLines.teamId, q.teamId));
    if (q.leagueId) cs.push(eq(schema.statLines.leagueId, q.leagueId));
    if (q.seasonId) cs.push(eq(schema.statLines.seasonId, q.seasonId));
    if (q.divisionId) cs.push(eq(schema.statLines.divisionId, q.divisionId));
    if (q.gameId) cs.push(eq(schema.statLines.gameId, q.gameId));
    if (q.cursor) cs.push(gt(schema.statLines.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.statLines)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.statLines.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toLine(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async listLinesForGame(gameId: string): Promise<StatLineRow[]> {
    const rows = await this.db
      .select()
      .from(schema.statLines)
      .where(eq(schema.statLines.gameId, gameId));
    return rows.map((r) => this.toLine(r));
  }

  async upsertStatLines(rows: UpsertStatLine[]): Promise<void> {
    if (!rows.length) return;
    await this.db
      .insert(schema.statLines)
      .values(
        rows.map((r) => ({
          gameId: r.gameId,
          personId: r.personId,
          teamId: r.teamId,
          sportCode: r.sportCode,
          seasonId: r.seasonId ?? null,
          leagueId: r.leagueId ?? null,
          divisionId: r.divisionId ?? null,
          gpIncrement: r.gpIncrement ?? 1,
          minutesPlayed: r.minutesPlayed ?? null,
          core: r.core,
          extended: r.extended
        }))
      )
      .onConflictDoUpdate({
        target: [schema.statLines.gameId, schema.statLines.personId],
        set: {
          teamId: sql`EXCLUDED.team_id`,
          core: sql`EXCLUDED.core`,
          extended: sql`EXCLUDED.extended`,
          minutesPlayed: sql`EXCLUDED.minutes_played`,
          derivedAt: sql`NOW()`
        }
      });
  }

  async deleteStatLinesForGame(gameId: string): Promise<void> {
    await this.db
      .delete(schema.statLines)
      .where(eq(schema.statLines.gameId, gameId));
  }

  // ---------- Standings ----------

  async listStandings(
    leagueId: string,
    divisionId?: string
  ): Promise<StandingRow[]> {
    const cs = [eq(schema.standings.leagueId, leagueId)];
    if (divisionId) cs.push(eq(schema.standings.divisionId, divisionId));
    const rows = await this.db
      .select()
      .from(schema.standings)
      .where(and(...cs))
      .orderBy(asc(schema.standings.rank));
    return rows.map((r) => this.toStanding(r));
  }

  async upsertStanding(
    row: Omit<StandingRow, "id" | "derivedAt">
  ): Promise<void> {
    await this.db
      .insert(schema.standings)
      .values({
        leagueId: row.leagueId,
        divisionId: row.divisionId,
        teamId: row.teamId,
        gp: row.gp,
        w: row.w,
        l: row.l,
        t: row.t,
        otl: row.otl,
        points: row.points,
        gf: row.gf,
        ga: row.ga,
        gd: row.gd,
        rank: row.rank,
        tiebreakers: row.tiebreakers
      })
      .onConflictDoUpdate({
        target: [
          schema.standings.leagueId,
          schema.standings.divisionId,
          schema.standings.teamId
        ],
        set: {
          gp: row.gp,
          w: row.w,
          l: row.l,
          t: row.t,
          otl: row.otl,
          points: row.points,
          gf: row.gf,
          ga: row.ga,
          gd: row.gd,
          rank: row.rank,
          tiebreakers: row.tiebreakers,
          derivedAt: sql`NOW()`
        }
      });
  }

  async deleteStandingsForLeague(leagueId: string): Promise<void> {
    await this.db
      .delete(schema.standings)
      .where(eq(schema.standings.leagueId, leagueId));
  }

  // ---------- Leaderboards ----------

  async upsertLeaderboard(
    row: Omit<LeaderboardRow, "id" | "rankedAt">
  ): Promise<void> {
    await this.db
      .insert(schema.leaderboards)
      .values({
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        metric: row.metric,
        windowKind: row.windowKind,
        sportCode: row.sportCode,
        entries: row.entries
      })
      .onConflictDoUpdate({
        target: [
          schema.leaderboards.scopeType,
          schema.leaderboards.scopeId,
          schema.leaderboards.metric,
          schema.leaderboards.windowKind
        ],
        set: { entries: row.entries, rankedAt: sql`NOW()` }
      });
  }

  async findLeaderboard(
    scopeType: string,
    scopeId: string | null,
    metric: string,
    windowKind: string
  ): Promise<LeaderboardRow | null> {
    const cs = [
      eq(schema.leaderboards.scopeType, scopeType),
      eq(schema.leaderboards.metric, metric),
      eq(schema.leaderboards.windowKind, windowKind)
    ];
    if (scopeId) cs.push(eq(schema.leaderboards.scopeId, scopeId));
    const [row] = await this.db
      .select()
      .from(schema.leaderboards)
      .where(and(...cs))
      .limit(1);
    return row ? this.toLeaderboard(row) : null;
  }

  // ---------- mappers ----------

  private toLine(r: typeof schema.statLines.$inferSelect): StatLineRow {
    return {
      id: r.id,
      gameId: r.gameId,
      personId: r.personId,
      teamId: r.teamId,
      sportCode: r.sportCode,
      seasonId: r.seasonId,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      gpIncrement: r.gpIncrement,
      minutesPlayed: r.minutesPlayed,
      core: r.core as Record<string, number>,
      extended: r.extended as Record<string, unknown>,
      derivedAt: r.derivedAt,
      createdAt: r.createdAt
    };
  }
  private toStanding(r: typeof schema.standings.$inferSelect): StandingRow {
    return {
      id: r.id,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      teamId: r.teamId,
      gp: r.gp,
      w: r.w,
      l: r.l,
      t: r.t,
      otl: r.otl,
      points: r.points,
      gf: r.gf,
      ga: r.ga,
      gd: r.gd,
      rank: r.rank,
      tiebreakers: r.tiebreakers as Record<string, unknown>,
      derivedAt: r.derivedAt
    };
  }
  private toLeaderboard(
    r: typeof schema.leaderboards.$inferSelect
  ): LeaderboardRow {
    return {
      id: r.id,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      metric: r.metric,
      windowKind: r.windowKind,
      sportCode: r.sportCode,
      entries: r.entries as LeaderboardRow["entries"],
      rankedAt: r.rankedAt
    };
  }
}
