import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { RosterMove } from "../../domain/entities/roster-move.entity";
import { RosterMoveId } from "../../domain/identifiers";
import type {
  ListRosterMovesQuery,
  RosterMoveRepository
} from "../../domain/repositories/roster-move.repository";

@Injectable()
export class DrizzleRosterMoveRepository implements RosterMoveRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: RosterMoveId): Promise<RosterMove | null> {
    const [row] = await this.db
      .select()
      .from(schema.rosterMoves)
      .where(eq(schema.rosterMoves.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findBySourceEventId(sourceEventId: string): Promise<RosterMove | null> {
    const [row] = await this.db
      .select()
      .from(schema.rosterMoves)
      .where(eq(schema.rosterMoves.sourceEventId, sourceEventId))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListRosterMovesQuery): Promise<Page<RosterMove>> {
    const cs = [];
    if (q.teamId) cs.push(eq(schema.rosterMoves.teamId, q.teamId));
    if (q.personId) cs.push(eq(schema.rosterMoves.personId, q.personId));
    if (q.seasonId) cs.push(eq(schema.rosterMoves.seasonId, q.seasonId));
    if (q.moveType) cs.push(eq(schema.rosterMoves.moveType, q.moveType));
    if (q.cursor) cs.push(gt(schema.rosterMoves.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.rosterMoves)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.rosterMoves.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(m: RosterMove): Promise<void> {
    const x = m.toSnapshot();
    await this.db.insert(schema.rosterMoves).values({
      id: x.id,
      teamId: x.teamId,
      personId: x.personId,
      seasonId: x.seasonId,
      moveType: x.moveType,
      membershipType: x.membershipType,
      effectiveAt: x.effectiveAt,
      effectiveTo: x.effectiveTo,
      jerseyNumber: x.jerseyNumber,
      positionCode: x.positionCode,
      reason: x.reason,
      sourceEventId: x.sourceEventId,
      createdByUserId: x.createdByUserId,
      metadata: x.metadata
    });
  }

  async listForProjection(
    teamId: string,
    seasonId: string,
    asOf?: Date
  ): Promise<RosterMove[]> {
    const cs = [
      eq(schema.rosterMoves.teamId, teamId),
      eq(schema.rosterMoves.seasonId, seasonId)
    ];
    if (asOf) cs.push(lte(schema.rosterMoves.effectiveAt, asOf));
    const rows = await this.db
      .select()
      .from(schema.rosterMoves)
      .where(and(...cs))
      .orderBy(asc(schema.rosterMoves.effectiveAt));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(r: typeof schema.rosterMoves.$inferSelect): RosterMove {
    return RosterMove.rehydrate({
      id: r.id,
      teamId: r.teamId,
      personId: r.personId,
      seasonId: r.seasonId,
      moveType: r.moveType as never,
      membershipType: r.membershipType as never,
      effectiveAt: r.effectiveAt,
      effectiveTo: r.effectiveTo,
      jerseyNumber: r.jerseyNumber,
      positionCode: r.positionCode,
      reason: r.reason,
      sourceEventId: r.sourceEventId,
      createdByUserId: r.createdByUserId,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt
    });
  }
}
