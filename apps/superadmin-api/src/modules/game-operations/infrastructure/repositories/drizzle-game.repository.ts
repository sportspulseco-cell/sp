import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Game, type GameSnapshot } from "../../domain/entities/game.entity";
import { GameId } from "../../domain/identifiers";
import type {
  GameRepository,
  ListGamesQuery
} from "../../domain/repositories/game.repository";
import { afterCursor, encodeCursor, keysetOrder } from "../../../../shared/pagination/keyset";

type GameRow = typeof schema.games.$inferSelect;

/** Row -> aggregate. Shared with transactional handlers (finalize, reschedule). */
export function rowToGame(r: GameRow): Game {
  return Game.rehydrate({
    id: r.id,
    leagueId: r.leagueId,
    seasonId: r.seasonId,
    divisionId: r.divisionId,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    sportCode: r.sportCode,
    scheduledStartTsUtc: r.scheduledStartTsUtc,
    tz: r.tz,
    durationMin: r.durationMin,
    venueName: r.venueName,
    surfaceLabel: r.surfaceLabel,
    status: r.status as never,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    period: r.period,
    metadata: r.metadata as Record<string, unknown>,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    finalizedAt: r.finalizedAt,
    finalizedByUserId: r.finalizedByUserId,
    publishedAt: r.publishedAt,
    slotId: r.slotId,
    surfaceId: r.surfaceId,
    scheduleRunId: r.scheduleRunId,
    lockedAt: r.lockedAt,
    lockedByUserId: r.lockedByUserId,
    source: r.source
  });
}

/**
 * Lifecycle columns the plain `save()` writes (start, score, postpone,
 * cancel, forfeit). Publish, slot and lock columns are left alone so a
 * lifecycle click never overwrites a concurrent scheduler publish or move.
 */
function gameLifecycleValues(x: GameSnapshot) {
  return {
    scheduledStartTsUtc: x.scheduledStartTsUtc,
    tz: x.tz,
    durationMin: x.durationMin,
    venueName: x.venueName,
    surfaceLabel: x.surfaceLabel,
    status: x.status,
    homeScore: x.homeScore,
    awayScore: x.awayScore,
    period: x.period,
    metadata: x.metadata,
    finalizedAt: x.finalizedAt,
    finalizedByUserId: x.finalizedByUserId,
    updatedAt: sql`NOW()`
  };
}

/**
 * Every column an aggregate command may change, for the commands that
 * lock the row first (finalize, publish, reschedule). Ids, teams and
 * season never change.
 */
export function gameUpdateValues(x: GameSnapshot) {
  return {
    scheduledStartTsUtc: x.scheduledStartTsUtc,
    tz: x.tz,
    durationMin: x.durationMin,
    venueName: x.venueName,
    surfaceLabel: x.surfaceLabel,
    status: x.status,
    homeScore: x.homeScore,
    awayScore: x.awayScore,
    period: x.period,
    metadata: x.metadata,
    finalizedAt: x.finalizedAt,
    finalizedByUserId: x.finalizedByUserId,
    publishedAt: x.publishedAt,
    slotId: x.slotId,
    surfaceId: x.surfaceId,
    lockedAt: x.lockedAt,
    lockedByUserId: x.lockedByUserId,
    source: x.source,
    updatedAt: sql`NOW()`
  };
}

/** Insert values for a new aggregate. Shared with the transactional create. */
export function gameInsertValues(x: GameSnapshot): typeof schema.games.$inferInsert {
  return {
    id: x.id,
    leagueId: x.leagueId,
    seasonId: x.seasonId,
    divisionId: x.divisionId,
    homeTeamId: x.homeTeamId,
    awayTeamId: x.awayTeamId,
    sportCode: x.sportCode,
    scheduledStartTsUtc: x.scheduledStartTsUtc,
    tz: x.tz,
    durationMin: x.durationMin,
    venueName: x.venueName,
    surfaceLabel: x.surfaceLabel,
    status: x.status,
    homeScore: x.homeScore,
    awayScore: x.awayScore,
    period: x.period,
    metadata: x.metadata,
    publishedAt: x.publishedAt,
    slotId: x.slotId,
    surfaceId: x.surfaceId,
    scheduleRunId: x.scheduleRunId,
    lockedAt: x.lockedAt,
    lockedByUserId: x.lockedByUserId,
    source: x.source
  };
}

@Injectable()
export class DrizzleGameRepository implements GameRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: GameId): Promise<Game | null> {
    const [row] = await this.db
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, id.value))
      .limit(1);
    return row ? rowToGame(row) : null;
  }

  async list(q: ListGamesQuery): Promise<Page<Game>> {
    const cs = [];
    if (q.leagueId) cs.push(eq(schema.games.leagueId, q.leagueId));
    if (q.divisionId) cs.push(eq(schema.games.divisionId, q.divisionId));
    if (q.status) cs.push(eq(schema.games.status, q.status));
    if (q.teamId) {
      cs.push(
        or(
          eq(schema.games.homeTeamId, q.teamId),
          eq(schema.games.awayTeamId, q.teamId)
        )!
      );
    }
    if (q.fromTs) cs.push(gte(schema.games.scheduledStartTsUtc, q.fromTs));
    if (q.toTs) cs.push(lte(schema.games.scheduledStartTsUtc, q.toTs));
    if (q.cursor)
      cs.push(afterCursor(schema.games.scheduledStartTsUtc, schema.games.id, q.cursor, "asc"));
    if (q.leagueIdsFilter)
      cs.push(inArray(schema.games.leagueId, q.leagueIdsFilter));
    if (q.publishedOnly) cs.push(isNotNull(schema.games.publishedAt));
    if (q.withoutOfficials) {
      cs.push(sql`not exists (select 1 from game_officials o where o.game_id = ${schema.games.id} and o.revoked_at is null and o.status <> 'declined')`);
    }
    if (q.officiating) {
      const o = q.officiating;
      const any = [];
      if (o.gameIds.length) any.push(inArray(schema.games.id, o.gameIds));
      if (o.leagueIds.length) any.push(inArray(schema.games.leagueId, o.leagueIds));
      if (o.divisionIds.length) any.push(inArray(schema.games.divisionId, o.divisionIds));
      if (o.seasonIds.length) {
        any.push(inArray(schema.games.seasonId, o.seasonIds));
        any.push(
          inArray(
            schema.games.divisionId,
            this.db
              .select({ id: schema.divisions.id })
              .from(schema.divisions)
              .where(inArray(schema.divisions.seasonId, o.seasonIds))
          )
        );
      }
      if (o.orgIds.length) {
        any.push(
          inArray(
            schema.games.leagueId,
            this.db
              .select({ id: schema.leagues.id })
              .from(schema.leagues)
              .where(inArray(schema.leagues.orgId, o.orgIds))
          )
        );
      }
      if (any.length === 0) return { items: [], nextCursor: null };
      cs.push(or(...any)!);
    }

    const rows = await this.db
      .select()
      .from(schema.games)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(...keysetOrder(schema.games.scheduledStartTsUtc, schema.games.id, "asc"))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map(rowToGame);
    const last = rows[q.limit - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.scheduledStartTsUtc, last.id) : null;
    return { items, nextCursor };
  }

  async insert(g: Game): Promise<void> {
    await this.db.insert(schema.games).values(gameInsertValues(g.toSnapshot()));
  }

  async save(g: Game): Promise<void> {
    const x = g.toSnapshot();
    await this.db
      .update(schema.games)
      .set(gameLifecycleValues(x))
      .where(eq(schema.games.id, x.id));
  }
}
