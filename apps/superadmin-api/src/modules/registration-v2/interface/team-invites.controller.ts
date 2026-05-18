import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { RegistrationV2Service } from "../application/registration-v2.service";
import {
  CreateTeamInviteBodyDto,
  ListTeamInvitesQueryDto
} from "./dto/team-invite.dto";

@ApiTags("registration-v2/team-invites")
@ApiBearerAuth()
@Controller("registration-v2/team-invites")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class TeamInvitesController {
  constructor(
    private readonly svc: RegistrationV2Service,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get()
  @ApiOperation({ summary: "List team invites (filter by team / season / status)" })
  async list(
    @Query() q: ListTeamInvitesQueryDto,
    @UserScope() scope: UserScopeType
  ) {
    // Team invites carry the invitee's email (PII). Non-super-admin
    // callers must scope to a team they can see — captain/team_admin via
    // scope.teamIds, league/org admins via team's org+league. We require
    // teamId (or seasonId routed via the team's league) and verify
    // access before returning.
    if (!scope.isSuperAdmin) {
      if (!q.teamId && !q.seasonId) {
        throw new BadRequestException(
          "teamId or seasonId is required for non-super-admin callers"
        );
      }
      if (q.teamId) {
        const [team] = await this.db
          .select({ id: schema.teams.id, orgId: schema.teams.orgId })
          .from(schema.teams)
          .where(eq(schema.teams.id, q.teamId))
          .limit(1);
        if (!team) {
          throw new NotFoundException(`Team not found: ${q.teamId}`);
        }
        const inTeamScope =
          !!scope.teamIds && scope.teamIds.includes(team.id);
        const inOrgScope =
          scope.orgIds === null || scope.orgIds.includes(team.orgId);
        const inLeagueScope = scope.leagueIds === null;
        if (!inTeamScope && !inOrgScope && !inLeagueScope) {
          throw new NotFoundException(`Team not found: ${q.teamId}`);
        }
      } else if (q.seasonId) {
        const [season] = await this.db
          .select({
            leagueId: schema.seasons.leagueId,
            orgId: schema.seasons.orgId
          })
          .from(schema.seasons)
          .where(eq(schema.seasons.id, q.seasonId))
          .limit(1);
        if (!season) {
          throw new NotFoundException(`Season not found: ${q.seasonId}`);
        }
        const inLeagueScope =
          scope.leagueIds === null || scope.leagueIds.includes(season.leagueId);
        const inOrgScope =
          scope.orgIds === null || scope.orgIds.includes(season.orgId);
        if (!inLeagueScope && !inOrgScope) {
          throw new NotFoundException(`Season not found: ${q.seasonId}`);
        }
      }
    }
    return this.svc.listTeamInvites(q);
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary: "Create a team invite (personal email or generic team URL)"
  })
  create(
    @Body() body: CreateTeamInviteBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    // Captains issue invites for their own team only. League/org/super
    // admins always pass.
    const allowed =
      scope.isSuperAdmin ||
      scope.leagueIds === null ||
      (scope.teamIds?.includes(body.teamId) ?? false);
    if (!allowed) {
      throw new ForbiddenException("Cannot issue invites for this team");
    }
    return this.svc.createTeamInvite({
      ...body,
      issuedByUserId: user.userId
    });
  }

  @Patch(":id/revoke")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Revoke an outstanding invite" })
  async revoke(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ) {
    // Captains/team_admins can revoke their own team's invites; we
    // resolve the invite first so we know the teamId to check.
    const invite = await this.svc.getTeamInvite(id);
    const allowed =
      scope.isSuperAdmin ||
      scope.leagueIds === null ||
      (invite && (scope.teamIds?.includes(invite.teamId) ?? false));
    if (!allowed) {
      throw new ForbiddenException("Cannot revoke this invite");
    }
    return this.svc.revokeTeamInvite(id);
  }
}
