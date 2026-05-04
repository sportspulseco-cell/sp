import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Team } from "../../domain/entities/team.entity";
import { TeamId } from "../../domain/identifiers";
import type {
  ListTeamsQuery,
  TeamRepository
} from "../../domain/repositories/team.repository";

@Injectable()
export class DrizzleTeamRepository implements TeamRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: TeamId): Promise<Team | null> {
    const [row] = await this.db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsInLeagues(id: TeamId, leagueIds: string[]): Promise<boolean> {
    if (leagueIds.length === 0) return false;
    const [row] = await this.db
      .select({ id: schema.divisionTeamEntries.id })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, id.value),
          isNull(schema.divisionTeamEntries.leftAt),
          inArray(schema.divisions.leagueId, leagueIds)
        )
      )
      .limit(1);
    return !!row;
  }

  async list(q: ListTeamsQuery): Promise<Page<Team>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.teams.orgId, q.orgId));
    if (q.sportCode) cs.push(eq(schema.teams.sportCode, q.sportCode));
    if (q.status) cs.push(eq(schema.teams.status, q.status));
    if (q.search) cs.push(ilike(schema.teams.name, `%${q.search}%`));
    if (q.cursor) cs.push(gt(schema.teams.id, q.cursor));
    if (q.leagueIdsFilter) {
      const allowedTeamIds = this.db
        .select({ teamId: schema.divisionTeamEntries.teamId })
        .from(schema.divisionTeamEntries)
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            isNull(schema.divisionTeamEntries.leftAt),
            inArray(schema.divisions.leagueId, q.leagueIdsFilter)
          )
        );
      cs.push(inArray(schema.teams.id, allowedTeamIds));
    }

    const rows = await this.db
      .select()
      .from(schema.teams)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(schema.teams.id)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(t: Team): Promise<void> {
    const x = t.toSnapshot();
    await this.db.insert(schema.teams).values({
      id: x.id,
      orgId: x.orgId,
      name: x.name,
      shortName: x.shortName,
      sportCode: x.sportCode,
      colors: x.colors,
      logoUrl: x.logoUrl,
      externalIds: x.externalIds,
      status: x.status
    });
  }

  async save(t: Team): Promise<void> {
    const x = t.toSnapshot();
    await this.db
      .update(schema.teams)
      .set({
        name: x.name,
        shortName: x.shortName,
        colors: x.colors,
        logoUrl: x.logoUrl,
        externalIds: x.externalIds,
        status: x.status,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.teams.id, x.id));
  }

  async delete(id: TeamId): Promise<void> {
    await this.db
      .update(schema.teams)
      .set({ deletedAt: sql`NOW()` })
      .where(eq(schema.teams.id, id.value));
  }

  private toDomain(r: typeof schema.teams.$inferSelect): Team {
    return Team.rehydrate({
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      shortName: r.shortName,
      sportCode: r.sportCode,
      colors: r.colors as Record<string, unknown>,
      logoUrl: r.logoUrl,
      externalIds: r.externalIds as Record<string, unknown>,
      status: r.status as never,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
