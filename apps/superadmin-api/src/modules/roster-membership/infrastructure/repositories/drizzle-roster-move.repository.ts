import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
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

  async loadScopeContext(
    id: RosterMoveId
  ): Promise<{ teamId: string; orgId: string } | null> {
    const [row] = await this.db
      .select({
        teamId: schema.rosterMoves.teamId,
        orgId: schema.teams.orgId
      })
      .from(schema.rosterMoves)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.rosterMoves.teamId))
      .where(eq(schema.rosterMoves.id, id.value))
      .limit(1);
    return row ?? null;
  }

  async teamReachableViaLeagues(
    teamId: string,
    leagueIds: string[]
  ): Promise<boolean> {
    if (leagueIds.length === 0) return false;
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
          eq(schema.divisionTeamEntries.teamId, teamId),
          isNull(schema.divisionTeamEntries.leftAt),
          inArray(schema.seasons.leagueId, leagueIds)
        )
      )
      .limit(1);
    return !!row;
  }

  async list(q: ListRosterMovesQuery): Promise<Page<RosterMove>> {
    const cs = [];
    if (q.teamId) cs.push(eq(schema.rosterMoves.teamId, q.teamId));
    if (q.personId) cs.push(eq(schema.rosterMoves.personId, q.personId));
    if (q.seasonId) cs.push(eq(schema.rosterMoves.seasonId, q.seasonId));
    if (q.moveType) cs.push(eq(schema.rosterMoves.moveType, q.moveType));
    if (q.cursor) cs.push(gt(schema.rosterMoves.id, q.cursor));

    // Scope filter: a move is in scope when its team is in the
    // caller's team-scope. Union of orgIdsFilter, teamIdsFilter, and
    // teams reachable via active DTE in leagueIdsFilter.
    const hasOrgFilter =
      q.orgIdsFilter !== undefined && q.orgIdsFilter.length > 0;
    const hasTeamFilter =
      q.teamIdsFilter !== undefined && q.teamIdsFilter.length > 0;
    const hasLeagueFilter =
      q.leagueIdsFilter !== undefined && q.leagueIdsFilter.length > 0;
    if (hasOrgFilter || hasTeamFilter || hasLeagueFilter) {
      const allowedTeamIds = this.db
        .select({ id: schema.teams.id })
        .from(schema.teams);
      const branches = [];
      if (hasOrgFilter) {
        branches.push(inArray(schema.teams.orgId, q.orgIdsFilter!));
      }
      if (hasTeamFilter) {
        branches.push(inArray(schema.teams.id, q.teamIdsFilter!));
      }
      if (hasLeagueFilter) {
        // Team is in league scope if it has an active DTE under one of
        // those leagues. Same pattern as the teams repo list.
        const dteAllowed = this.db
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
        branches.push(inArray(schema.teams.id, dteAllowed));
      }
      const allowedScopeTeams = allowedTeamIds.where(
        branches.length === 1 ? branches[0] : or(...branches)
      );
      cs.push(inArray(schema.rosterMoves.teamId, allowedScopeTeams));
    }

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
