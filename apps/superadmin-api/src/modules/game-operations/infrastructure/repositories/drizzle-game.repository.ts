import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Game } from "../../domain/entities/game.entity";
import { GameId } from "../../domain/identifiers";
import type {
  GameRepository,
  ListGamesQuery
} from "../../domain/repositories/game.repository";

@Injectable()
export class DrizzleGameRepository implements GameRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: GameId): Promise<Game | null> {
    const [row] = await this.db
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
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
    if (q.cursor) cs.push(gt(schema.games.id, q.cursor));
    if (q.leagueIdsFilter)
      cs.push(inArray(schema.games.leagueId, q.leagueIdsFilter));

    const rows = await this.db
      .select()
      .from(schema.games)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.games.scheduledStartTsUtc), asc(schema.games.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(g: Game): Promise<void> {
    const x = g.toSnapshot();
    await this.db.insert(schema.games).values({
      id: x.id,
      leagueId: x.leagueId,
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
      metadata: x.metadata
    });
  }

  async save(g: Game): Promise<void> {
    const x = g.toSnapshot();
    await this.db
      .update(schema.games)
      .set({
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
      })
      .where(eq(schema.games.id, x.id));
  }

  private toDomain(r: typeof schema.games.$inferSelect): Game {
    return Game.rehydrate({
      id: r.id,
      leagueId: r.leagueId,
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
      finalizedByUserId: r.finalizedByUserId
    });
  }
}
