import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Suspension } from "../../domain/entities/suspension.entity";
import { SuspensionId } from "../../domain/identifiers";
import type {
  ListSuspensionsQuery,
  SuspensionRepository
} from "../../domain/repositories/suspension.repository";

@Injectable()
export class DrizzleSuspensionRepository implements SuspensionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: SuspensionId): Promise<Suspension | null> {
    const [row] = await this.db
      .select()
      .from(schema.suspensions)
      .where(eq(schema.suspensions.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListSuspensionsQuery): Promise<Page<Suspension>> {
    const cs = [];
    if (q.personId) cs.push(eq(schema.suspensions.personId, q.personId));
    if (q.status) cs.push(eq(schema.suspensions.status, q.status));
    if (q.cursor) cs.push(gt(schema.suspensions.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.suspensions)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.suspensions.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(s: Suspension): Promise<void> {
    const x = s.toSnapshot();
    await this.db.insert(schema.suspensions).values({
      id: x.id,
      personId: x.personId,
      sourceEventId: x.sourceEventId,
      kind: x.kind,
      nGames: x.nGames,
      nDays: x.nDays,
      servedCount: x.servedCount,
      status: x.status,
      reason: x.reason,
      startAt: x.startAt,
      endAt: x.endAt,
      issuedByUserId: x.issuedByUserId
    });
  }

  async save(s: Suspension): Promise<void> {
    const x = s.toSnapshot();
    await this.db
      .update(schema.suspensions)
      .set({
        servedCount: x.servedCount,
        status: x.status,
        reason: x.reason,
        endAt: x.endAt,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.suspensions.id, x.id));
  }

  private toDomain(r: typeof schema.suspensions.$inferSelect): Suspension {
    return Suspension.rehydrate({
      id: r.id,
      personId: r.personId,
      sourceEventId: r.sourceEventId,
      kind: r.kind as never,
      nGames: r.nGames,
      nDays: r.nDays,
      servedCount: r.servedCount,
      status: r.status as never,
      reason: r.reason,
      startAt: r.startAt,
      endAt: r.endAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      issuedByUserId: r.issuedByUserId
    });
  }
}
