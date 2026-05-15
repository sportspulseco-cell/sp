import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  TEAM_REPOSITORY,
  type TeamRepository
} from "../../league-management/domain/repositories/team.repository";
import { TeamId } from "../../league-management/domain/identifiers";
import { TeamMembershipPageDto } from "../application/dtos/roster.dto";
import {
  ListMembershipsHandler,
  RosterSnapshotHandler
} from "../application/rosters/handlers";
import {
  ListMembershipsQueryDto,
  RosterSnapshotQueryDto
} from "./dto/roster.dto";

@ApiTags("roster/memberships")
@ApiBearerAuth()
@Controller("roster")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class RostersController {
  constructor(
    private readonly listMembershipsH: ListMembershipsHandler,
    private readonly snapshotH: RosterSnapshotHandler,
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get("memberships")
  @ApiOperation({
    summary: "List team memberships (current state projection)"
  })
  list(
    @Query() q: ListMembershipsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<TeamMembershipPageDto> {
    // If the request narrows to a team that's in the user's direct team
    // scope, bypass the league filter — team-scoped users (team_admin /
    // coach / player) typically have leagueIds=[] but explicit team
    // access via their assignment.
    const inDirectTeamScope =
      q.teamId && (scope.teamIds?.includes(q.teamId) ?? false);
    return this.listMembershipsH.execute({
      ...q,
      leagueIdsFilter: inDirectTeamScope ? undefined : (scope.leagueIds ?? undefined)
    });
  }

  /**
   * Source-attributed active-membership read backed by the
   * `v_active_season_membership` materialized view (P2-3 part B).
   *
   * Use this endpoint when the caller cares about HOW each player
   * got onto the team — `source` ∈ {team_join_request, team_invite,
   * free_agent, admin_direct}. Refreshed hourly via the materialized
   * views cron, so it is **not** suitable for write-path freshness
   * checks (e.g. "is this player on the team RIGHT NOW after I
   * just added them"). Use /roster/memberships for those.
   *
   * Filter by `seasonId`, `teamId`, or `personId` — at least one is
   * required to keep query cost bounded.
   */
  @Get("active-by-season")
  @ApiOperation({
    summary:
      "Active memberships with cross-path source attribution. Backed by v_active_season_membership. Hourly refresh — use /roster/memberships for write-path freshness."
  })
  async activeBySeason(
    @Query("seasonId") seasonId?: string,
    @Query("teamId") teamId?: string,
    @Query("personId") personId?: string
  ): Promise<{
    items: Array<{
      membershipId: string;
      personId: string;
      seasonId: string;
      teamId: string;
      membershipType: string;
      effectiveFrom: string;
      source: string;
    }>;
  }> {
    if (!seasonId && !teamId && !personId) {
      throw new NotFoundException(
        "At least one of seasonId, teamId, personId is required."
      );
    }
    const filters: ReturnType<typeof sql>[] = [];
    if (seasonId) filters.push(sql`season_id = ${seasonId}`);
    if (teamId) filters.push(sql`team_id = ${teamId}`);
    if (personId) filters.push(sql`person_id = ${personId}`);
    const whereClause = sql.join(filters, sql` AND `);
    const rows = await this.db.execute<{
      membership_id: string;
      person_id: string;
      season_id: string;
      team_id: string;
      membership_type: string;
      effective_from: Date | string;
      source: string;
    }>(sql`
      SELECT membership_id, person_id, season_id, team_id,
             membership_type, effective_from, source
      FROM v_active_season_membership
      WHERE ${whereClause}
      ORDER BY effective_from DESC
      LIMIT 500
    `);
    const items = (rows as unknown as Array<{
      membership_id: string;
      person_id: string;
      season_id: string;
      team_id: string;
      membership_type: string;
      effective_from: Date | string;
      source: string;
    }>).map((r) => ({
      membershipId: r.membership_id,
      personId: r.person_id,
      seasonId: r.season_id,
      teamId: r.team_id,
      membershipType: r.membership_type,
      effectiveFrom:
        r.effective_from instanceof Date
          ? r.effective_from.toISOString()
          : r.effective_from,
      source: r.source
    }));
    return { items };
  }

  @Get("snapshot")
  @ApiOperation({
    summary: "Roster snapshot at a point in time (event-replay projection)"
  })
  async snapshot(
    @Query() q: RosterSnapshotQueryDto,
    @UserScope() scope: UserScopeType
  ) {
    if (scope.leagueIds) {
      const inScope = await this.teams.existsInLeagues(
        TeamId.of(q.teamId),
        scope.leagueIds
      );
      if (!inScope) throw new NotFoundException(`Team ${q.teamId} not found`);
    }
    return this.snapshotH.execute(q);
  }
}
