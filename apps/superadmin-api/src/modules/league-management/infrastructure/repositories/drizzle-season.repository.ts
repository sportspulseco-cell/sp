import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Season } from "../../domain/entities/season.entity";
import { SeasonId } from "../../domain/identifiers";
import type {
  ListSeasonsQuery,
  SeasonRepository
} from "../../domain/repositories/season.repository";

const isoDate = (d: string | Date | null): string => {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
};

@Injectable()
export class DrizzleSeasonRepository implements SeasonRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: SeasonId): Promise<Season | null> {
    const [row] = await this.db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListSeasonsQuery): Promise<Page<Season>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.seasons.orgId, q.orgId));
    if (q.sportCode) cs.push(eq(schema.seasons.sportCode, q.sportCode));
    if (q.status) cs.push(eq(schema.seasons.status, q.status));
    if (q.search) cs.push(ilike(schema.seasons.name, `%${q.search}%`));
    if (q.cursor) cs.push(gt(schema.seasons.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.seasons)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(schema.seasons.id)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(s: Season): Promise<void> {
    const x = s.toSnapshot();
    await this.db.insert(schema.seasons).values({
      id: x.id,
      orgId: x.orgId,
      name: x.name,
      sportCode: x.sportCode,
      startDate: x.startDate,
      endDate: x.endDate,
      registrationOpensAt: x.registrationOpensAt,
      registrationClosesAt: x.registrationClosesAt,
      rosterLockAt: x.rosterLockAt,
      timezone: x.timezone,
      status: x.status,
      metadata: x.metadata,
      createdByUserId: x.createdByUserId
    });
  }

  async save(s: Season): Promise<void> {
    const x = s.toSnapshot();
    await this.db
      .update(schema.seasons)
      .set({
        name: x.name,
        startDate: x.startDate,
        endDate: x.endDate,
        registrationOpensAt: x.registrationOpensAt,
        registrationClosesAt: x.registrationClosesAt,
        rosterLockAt: x.rosterLockAt,
        timezone: x.timezone,
        status: x.status,
        metadata: x.metadata,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.seasons.id, x.id));
  }

  async delete(id: SeasonId): Promise<void> {
    await this.db
      .update(schema.seasons)
      .set({ deletedAt: sql`NOW()` })
      .where(eq(schema.seasons.id, id.value));
  }

  private toDomain(r: typeof schema.seasons.$inferSelect): Season {
    return Season.rehydrate({
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      sportCode: r.sportCode,
      startDate: isoDate(r.startDate as unknown as string),
      endDate: isoDate(r.endDate as unknown as string),
      registrationOpensAt: r.registrationOpensAt,
      registrationClosesAt: r.registrationClosesAt,
      rosterLockAt: r.rosterLockAt,
      timezone: r.timezone,
      status: r.status as never,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      createdByUserId: r.createdByUserId
    });
  }
}
