import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RegistrationV2Service } from "../application/registration-v2.service";

/**
 * Anonymous endpoint that resolves an invite token into team + season
 * context for the public registration funnel (Path 2D).
 * No auth required by design — the token IS the auth.
 */
@ApiTags("public/registration")
@Controller("public/registration/invites")
export class PublicInvitesController {
  constructor(private readonly svc: RegistrationV2Service) {}

  @Get(":token")
  @ApiOperation({ summary: "Resolve invite token into team + season context" })
  resolve(@Param("token") token: string) {
    return this.svc.resolveTeamInviteByToken(token);
  }
}
