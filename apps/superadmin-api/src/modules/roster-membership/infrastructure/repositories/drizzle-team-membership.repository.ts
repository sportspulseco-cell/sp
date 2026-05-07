import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { TeamMembership } from "../../domain/entities/team-membership.entity";
import type {
  ListMembershipsQuery,
  MembershipUpsert,
  TeamMembershipRepository
} from "../../domain/repositories/team-membership.repository";

@Injectable()
export class DrizzleTeamMembershipRepository
  implements TeamMembershipRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(q: ListMembershipsQuery): Promise<Page<TeamMembership>> {
    const cs = [];
    if (q.teamId) cs.push(eq(schema.teamMemberships.teamId, q.teamId));
    if (q.personId) cs.push(eq(schema.teamMemberships.personId, q.personId));
    if (q.seasonId) cs.push(eq(schema.teamMemberships.seasonId, q.seasonId));
    if (q.activeOnly) cs.push(isNull(schema.teamMemberships.effectiveTo));
    if (q.cursor) cs.push(gt(schema.teamMemberships.id, q.cursor));
    if (q.leagueIdsFilter) {
      // division → season → league after the 2026-05-09 hierarchy flip.
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
            inArray(schema.seasons.leagueId, q.leagueIdsFilter)
          )
        );
      cs.push(inArray(schema.teamMemberships.teamId, allowedTeamIds));
    }

    const rows = await this.db
      .select()
      .from(schema.teamMemberships)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.teamMemberships.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async findActive(
    teamId: string,
    personId: string,
    seasonId: string
  ): Promise<TeamMembership | null> {
    const [row] = await this.db
      .select()
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.personId, personId),
          eq(schema.teamMemberships.seasonId, seasonId),
          isNull(schema.teamMemberships.effectiveTo)
        )
      )
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async open(input: MembershipUpsert): Promise<void> {
    await this.db.insert(schema.teamMemberships).values({
      teamId: input.teamId,
      personId: input.personId,
      seasonId: input.seasonId,
      membershipType: input.membershipType,
      jerseyNumber: input.jerseyNumber,
      positionCode: input.positionCode,
      effectiveFrom: input.effectiveFrom,
      lastMoveId: input.lastMoveId,
      currentStatus: input.currentStatus
    });
  }

  async close(
    teamId: string,
    personId: string,
    seasonId: string,
    at: Date,
    lastMoveId: string,
    status: string
  ): Promise<void> {
    await this.db
      .update(schema.teamMemberships)
      .set({
        effectiveTo: at,
        lastMoveId,
        currentStatus: status,
        updatedAt: sql`NOW()`
      })
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.personId, personId),
          eq(schema.teamMemberships.seasonId, seasonId),
          isNull(schema.teamMemberships.effectiveTo)
        )
      );
  }

  private toDomain(r: typeof schema.teamMemberships.$inferSelect): TeamMembership {
    return TeamMembership.rehydrate({
      id: r.id,
      teamId: r.teamId,
      personId: r.personId,
      seasonId: r.seasonId,
      membershipType: r.membershipType as never,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      jerseyNumber: r.jerseyNumber,
      positionCode: r.positionCode,
      currentStatus: r.currentStatus as never,
      lastMoveId: r.lastMoveId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
