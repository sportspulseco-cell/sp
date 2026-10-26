import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { SubstituteRequestsService } from "../application/substitute-requests.service";

class CreateSubRequestDto {
  @IsUUID() personId!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class AdminAssignSubDto {
  @IsUUID() teamId!: string;
  @IsUUID() personId!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Substitute requests (UC-31, FR-3.3.1, FR-3.3.3).
 *
 *   captain (team-admin-web)  /captain/subs/:teamId/...   userIsCaptainOfTeam, 404 otherwise
 *   asked player (player-web) /subs/...                   the request's person is the caller, 404 otherwise
 *   league / org admin        /admin/game-subs/:gameId    loadAdminScope covers the game, 404 otherwise
 *
 * Every rule and transition is in SubstituteRequestsService.
 */
@ApiTags("subs")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class SubstituteRequestsController {
  constructor(private readonly subs: SubstituteRequestsService) {}

  @Get("captain/subs/:teamId/games/:gameId")
  @ApiOperation({ summary: "Captain: the game's guest spots, sub requests and eligible subs with reasons." })
  captainView(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Param("gameId", ParseUUIDPipe) gameId: string
  ) {
    return this.subs.captainView(user.userId, teamId, gameId);
  }

  @Post("captain/subs/:teamId/games/:gameId/requests")
  @ApiOperation({ summary: "Captain: ask one eligible player to sub. Idempotent while the request is open." })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Param("gameId", ParseUUIDPipe) gameId: string,
    @Body() body: CreateSubRequestDto
  ) {
    return this.subs.createRequest(user.userId, teamId, gameId, body);
  }

  @Post("captain/subs/:teamId/requests/:requestId/cancel")
  @ApiOperation({ summary: "Captain: withdraw an open sub request." })
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Param("requestId", ParseUUIDPipe) requestId: string
  ) {
    return this.subs.cancelRequest(user.userId, teamId, requestId);
  }

  @Get("subs/mine")
  @ApiOperation({ summary: "Player: open sub requests waiting for the caller's answer." })
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.subs.myRequests(user.userId);
  }

  @Post("subs/requests/:requestId/accept")
  @ApiOperation({ summary: "Player: accept. Eligibility is re-checked and the player is added to the game as a guest." })
  accept(@CurrentUser() user: AuthPrincipal, @Param("requestId", ParseUUIDPipe) requestId: string) {
    return this.subs.answer(user.userId, requestId, "accept");
  }

  @Post("subs/requests/:requestId/decline")
  @ApiOperation({ summary: "Player: decline. The captain is told." })
  decline(@CurrentUser() user: AuthPrincipal, @Param("requestId", ParseUUIDPipe) requestId: string) {
    return this.subs.answer(user.userId, requestId, "decline");
  }

  @Get("admin/game-subs/:gameId")
  @ApiOperation({ summary: "League admin: both teams' guests, sub requests and candidates for one game." })
  adminView(@CurrentUser() user: AuthPrincipal, @Param("gameId", ParseUUIDPipe) gameId: string) {
    return this.subs.adminView(user.userId, gameId);
  }

  @Post("admin/game-subs/:gameId/assign")
  @ApiOperation({ summary: "League admin: put a sub on the game directly (roster override recorded)." })
  assign(
    @CurrentUser() user: AuthPrincipal,
    @Param("gameId", ParseUUIDPipe) gameId: string,
    @Body() body: AdminAssignSubDto
  ) {
    return this.subs.adminAssign(user.userId, gameId, body);
  }
}
