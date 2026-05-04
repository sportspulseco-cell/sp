import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { League } from "../../domain/entities/league.entity";
import { LeagueId } from "../../domain/identifiers";
import type {
  ListLeaguesQuery,
  LeagueRepository
} from "../../domain/repositories/league.repository";

@Injectable()
export class DrizzleLeagueRepository implements LeagueRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: LeagueId): Promise<League | null> {
    const [row] = await this.db
      .select()
      .from(schema.leagues)
      .where(eq(schema.leagues.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListLeaguesQuery): Promise<Page<League>> {
    const cs = [];
    if (q.seasonId) cs.push(eq(schema.leagues.seasonId, q.seasonId));
    if (q.sportCode) cs.push(eq(schema.leagues.sportCode, q.sportCode));
    if (q.status) cs.push(eq(schema.leagues.status, q.status));
    if (q.search) cs.push(ilike(schema.leagues.name, `%${q.search}%`));
    if (q.cursor) cs.push(gt(schema.leagues.id, q.cursor));
    if (q.leagueIdsFilter) cs.push(inArray(schema.leagues.id, q.leagueIdsFilter));

    const rows = await this.db
      .select()
      .from(schema.leagues)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(schema.leagues.id)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(l: League): Promise<void> {
    const x = l.toSnapshot();
    await this.db.insert(schema.leagues).values({
      id: x.id,
      seasonId: x.seasonId,
      sportCode: x.sportCode,
      governingBodyId: x.governingBodyId,
      ruleSetId: x.ruleSetId,
      name: x.name,
      format: x.format,
      status: x.status,
      metadata: x.metadata
    });
  }

  async save(l: League): Promise<void> {
    const x = l.toSnapshot();
    await this.db
      .update(schema.leagues)
      .set({
        name: x.name,
        governingBodyId: x.governingBodyId,
        ruleSetId: x.ruleSetId,
        format: x.format,
        status: x.status,
        metadata: x.metadata,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.leagues.id, x.id));
  }

  async delete(id: LeagueId): Promise<void> {
    await this.db
      .update(schema.leagues)
      .set({ deletedAt: sql`NOW()` })
      .where(eq(schema.leagues.id, id.value));
  }

  private toDomain(r: typeof schema.leagues.$inferSelect): League {
    return League.rehydrate({
      id: r.id,
      seasonId: r.seasonId,
      sportCode: r.sportCode,
      governingBodyId: r.governingBodyId,
      ruleSetId: r.ruleSetId,
      name: r.name,
      format: r.format as never,
      status: r.status as never,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
