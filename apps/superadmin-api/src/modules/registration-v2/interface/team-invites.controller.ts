import {
  Body,
  Controller,
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
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
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
  @ApiOperation({
    summary: "Create a team invite (personal email or generic team URL)"
  })
  create(
    @Body() body: CreateTeamInviteBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    return this.svc.createTeamInvite({
      ...body,
      issuedByUserId: user.userId
    });
  }

  @Patch(":id/revoke")
  @ApiOperation({ summary: "Revoke an outstanding invite" })
  revoke(@Param("id") id: string) {
    return this.svc.revokeTeamInvite(id);
  }
}
