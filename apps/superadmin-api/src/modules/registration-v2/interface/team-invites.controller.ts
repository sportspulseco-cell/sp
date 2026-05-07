import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
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
  constructor(private readonly svc: RegistrationV2Service) {}

  @Get()
  @ApiOperation({ summary: "List team invites (filter by team / season / status)" })
  list(@Query() q: ListTeamInvitesQueryDto) {
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
