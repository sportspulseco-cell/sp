import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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
    // Post-flip: divisions live under seasons, seasons under leagues.
    // Traverse division → season → league for the scope check.
    const [row] = await this.db
      .select({ id: schema.divisionTeamEntries.id })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, id.value),
          isNull(schema.divisionTeamEntries.leftAt),
          inArray(schema.seasons.leagueId, leagueIds)
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
    // Scope filter: orgIdsFilter and leagueIdsFilter union together.
    // A team is in scope when (a) its org is in the org whitelist, or
    // (b) it has an active DTE under a league in the league whitelist.
    // Org admins use the org branch to see orphan teams in their orgs.
    const hasLeagueFilter =
      q.leagueIdsFilter !== undefined && q.leagueIdsFilter.length > 0;
    const hasOrgFilter =
      q.orgIdsFilter !== undefined && q.orgIdsFilter.length > 0;
    if (hasLeagueFilter || hasOrgFilter) {
      const branches = [];
      if (hasOrgFilter) {
        branches.push(inArray(schema.teams.orgId, q.orgIdsFilter!));
      }
      if (hasLeagueFilter) {
        const allowedTeamIds = this.db
          .select({ teamId: schema.divisionTeamEntries.teamId })
          .from(schema.divisionTeamEntries)
          .innerJoin(
            schema.divisions,
            eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
          )
          .innerJoin(
            schema.seasons,
            eq(schema.seasons.id, schema.divisions.seasonId)
          )
          .where(
            and(
              isNull(schema.divisionTeamEntries.leftAt),
              inArray(schema.seasons.leagueId, q.leagueIdsFilter!)
            )
          );
        branches.push(inArray(schema.teams.id, allowedTeamIds));
      }
      cs.push(branches.length === 1 ? branches[0]! : or(...branches)!);
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
