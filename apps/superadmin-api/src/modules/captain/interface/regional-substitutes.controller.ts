import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { FREE_AGENT_POSITIONS, REGIONAL_SUB_POSITIONS, type RegionalSubPosition } from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { RegionalSubstitutesService } from "../application/regional-substitutes.service";
class RequestBody {
  @IsUUID() requestKey!: string;
  @IsIn([...REGIONAL_SUB_POSITIONS]) position!: RegionalSubPosition;
  @IsInt() @Min(1) @Max(10) needed!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class SubscriptionBody {
  @IsBoolean() enabled!: boolean;
  @IsArray() @ArrayMinSize(0) @ArrayMaxSize(5) @IsIn(FREE_AGENT_POSITIONS.map(position => position.value), { each: true }) positions!: string[];
}
class ReviewBody {
  @IsIn(["approve", "reject"]) action!: "approve" | "reject";
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class PendingQuery {
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @IsUUID() orgId?: string;
}
@ApiTags("regional-subs") @ApiBearerAuth() @Controller() @UseGuards(JwtAuthGuard)
export class RegionalSubstitutesController {
  constructor(private readonly regional: RegionalSubstitutesService) {}
  @Get("captain/regional-subs/:teamId/games/:gameId")
  captain(@CurrentUser() user: AuthPrincipal, @Param("teamId", ParseUUIDPipe) teamId: string, @Param("gameId", ParseUUIDPipe) gameId: string) {
    return this.regional.captainView(user.userId, teamId, gameId);
  }
  @Post("captain/regional-subs/:teamId/games/:gameId/requests")
  create(@CurrentUser() user: AuthPrincipal, @Param("teamId", ParseUUIDPipe) teamId: string, @Param("gameId", ParseUUIDPipe) gameId: string, @Body() body: RequestBody) {
    return this.regional.create(user.userId, teamId, gameId, body);
  }
  @Post("captain/regional-subs/:teamId/requests/:id/cancel")
  cancel(@CurrentUser() user: AuthPrincipal, @Param("teamId", ParseUUIDPipe) teamId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.regional.cancel(user.userId, teamId, id);
  }
  @Get("regional-subs/mine") mine(@CurrentUser() user: AuthPrincipal, @Query() query: PendingQuery) { return this.regional.mine(user.userId, query.cursor); }
  @Put("regional-subs/subscriptions/:regionId")
  subscribe(@CurrentUser() user: AuthPrincipal, @Param("regionId", ParseUUIDPipe) id: string, @Body() body: SubscriptionBody) {
    return this.regional.subscribe(user.userId, id, body.enabled, body.positions);
  }
  @Post("regional-subs/requests/:id/:action")
  answer(@CurrentUser() user: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Param("action") action: string) {
    if (action !== "accept" && action !== "decline") throw new BadRequestException("Choose accept or decline.");
    return this.regional.answer(user.userId, id, action);
  }
  @Get("admin/regional-subs/games/:gameId") @UseGuards(ScopedAdminGuard)
  admin(@CurrentUser() user: AuthPrincipal, @Param("gameId", ParseUUIDPipe) id: string) { return this.regional.adminView(user.userId, id); }
  @Get("admin/regional-subs/pending") @UseGuards(ScopedAdminGuard)
  pending(@CurrentUser() user: AuthPrincipal, @Query() query: PendingQuery) { return this.regional.pending(user.userId, query.cursor, query.orgId); }
  @Post("admin/regional-subs/requests/:id/review") @UseGuards(ScopedAdminGuard) @AllowScopedWrite()
  review(@CurrentUser() user: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() body: ReviewBody) {
    return this.regional.review(user.userId, id, body.action, body.note);
  }
}
