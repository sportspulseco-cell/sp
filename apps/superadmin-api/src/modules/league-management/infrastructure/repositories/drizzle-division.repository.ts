import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Division } from "../../domain/entities/division.entity";
import { DivisionId } from "../../domain/identifiers";
import type {
  ListDivisionsQuery,
  DivisionRepository
} from "../../domain/repositories/division.repository";

@Injectable()
export class DrizzleDivisionRepository implements DivisionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: DivisionId): Promise<Division | null> {
    const [row] = await this.db
      .select()
      .from(schema.divisions)
      .where(eq(schema.divisions.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListDivisionsQuery): Promise<Page<Division>> {
    const cs = [];
    if (q.leagueId) cs.push(eq(schema.divisions.leagueId, q.leagueId));
    if (q.status) cs.push(eq(schema.divisions.status, q.status));
    if (q.search) cs.push(ilike(schema.divisions.name, `%${q.search}%`));
    if (q.cursor) cs.push(gt(schema.divisions.id, q.cursor));
    if (q.leagueIdsFilter)
      cs.push(inArray(schema.divisions.leagueId, q.leagueIdsFilter));

    const rows = await this.db
      .select()
      .from(schema.divisions)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(schema.divisions.id)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(d: Division): Promise<void> {
    const x = d.toSnapshot();
    await this.db.insert(schema.divisions).values({
      id: x.id,
      leagueId: x.leagueId,
      ageGroupId: x.ageGroupId,
      name: x.name,
      tier: x.tier,
      genderEligibility: x.genderEligibility,
      ruleSetOverrides: x.ruleSetOverrides,
      maxTeams: x.maxTeams,
      playoffConfig: x.playoffConfig,
      status: x.status
    });
  }

  async save(d: Division): Promise<void> {
    const x = d.toSnapshot();
    await this.db
      .update(schema.divisions)
      .set({
        ageGroupId: x.ageGroupId,
        name: x.name,
        tier: x.tier,
        genderEligibility: x.genderEligibility,
        ruleSetOverrides: x.ruleSetOverrides,
        maxTeams: x.maxTeams,
        playoffConfig: x.playoffConfig,
        status: x.status,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.divisions.id, x.id));
  }

  async delete(id: DivisionId): Promise<void> {
    await this.db
      .update(schema.divisions)
      .set({ deletedAt: sql`NOW()` })
      .where(eq(schema.divisions.id, id.value));
  }

  private toDomain(r: typeof schema.divisions.$inferSelect): Division {
    return Division.rehydrate({
      id: r.id,
      leagueId: r.leagueId,
      ageGroupId: r.ageGroupId,
      name: r.name,
      tier: r.tier,
      genderEligibility: r.genderEligibility as never,
      ruleSetOverrides: r.ruleSetOverrides as Record<string, unknown>,
      maxTeams: r.maxTeams,
      playoffConfig: r.playoffConfig as Record<string, unknown>,
      status: r.status as never,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
