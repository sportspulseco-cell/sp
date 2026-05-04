import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { GameEvent } from "../../domain/entities/game-event.entity";
import { GameEventId } from "../../domain/identifiers";
import type {
  GameEventRepository,
  ListGameEventsQuery
} from "../../domain/repositories/game-event.repository";

@Injectable()
export class DrizzleGameEventRepository implements GameEventRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: GameEventId): Promise<GameEvent | null> {
    const [row] = await this.db
      .select()
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<GameEvent | null> {
    const [row] = await this.db
      .select()
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.idempotencyKey, key))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listForGame(gameId: string): Promise<GameEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.gameId, gameId))
      .orderBy(asc(schema.gameEvents.tsUtc));
    return rows.map((r) => this.toDomain(r));
  }

  async list(q: ListGameEventsQuery): Promise<Page<GameEvent>> {
    const cs = [];
    if (q.gameId) cs.push(eq(schema.gameEvents.gameId, q.gameId));
    if (q.eventType) cs.push(eq(schema.gameEvents.eventType, q.eventType));
    if (q.primaryPersonId)
      cs.push(eq(schema.gameEvents.primaryPersonId, q.primaryPersonId));
    if (q.cursor) cs.push(gt(schema.gameEvents.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.gameEvents)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.gameEvents.tsUtc), asc(schema.gameEvents.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(e: GameEvent): Promise<void> {
    const x = e.toSnapshot();
    await this.db.insert(schema.gameEvents).values({
      id: x.id,
      gameId: x.gameId,
      sportCode: x.sportCode,
      eventType: x.eventType,
      tsUtc: x.tsUtc,
      period: x.period,
      clockRemainingSec: x.clockRemainingSec,
      teamId: x.teamId,
      primaryPersonId: x.primaryPersonId,
      secondaryPersonIds: x.secondaryPersonIds,
      attributes: x.attributes,
      source: x.source,
      sourceDeviceId: x.sourceDeviceId,
      idempotencyKey: x.idempotencyKey,
      correctionOfEventId: x.correctionOfEventId,
      loggedByUserId: x.loggedByUserId
    });
  }

  private toDomain(r: typeof schema.gameEvents.$inferSelect): GameEvent {
    return GameEvent.rehydrate({
      id: r.id,
      gameId: r.gameId,
      sportCode: r.sportCode,
      eventType: r.eventType,
      tsUtc: r.tsUtc,
      period: r.period,
      clockRemainingSec: r.clockRemainingSec,
      teamId: r.teamId,
      primaryPersonId: r.primaryPersonId,
      secondaryPersonIds: r.secondaryPersonIds as string[],
      attributes: r.attributes as Record<string, unknown>,
      source: r.source as never,
      sourceDeviceId: r.sourceDeviceId,
      idempotencyKey: r.idempotencyKey,
      correctionOfEventId: r.correctionOfEventId,
      loggedByUserId: r.loggedByUserId,
      createdAt: r.createdAt
    });
  }
}
