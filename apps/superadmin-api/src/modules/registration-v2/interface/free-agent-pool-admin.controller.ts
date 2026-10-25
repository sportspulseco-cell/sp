import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { eq } from "drizzle-orm";
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  FREE_AGENT_DAYS,
  freeAgentAvailableDays,
  normalizeSkillLevel
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { orgVisible, seasonVisible, visibleSeasonIds } from "../../../shared/auth/visibility";
import { RegistrationV2Service } from "../application/registration-v2.service";
import { FreeAgentOffersService } from "../application/free-agent-offers.service";

class AdminPoolQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  /** Position code (C, LW, RW, D, G). */
  @ApiPropertyOptional() @IsOptional() @IsString() position?: string;
  /** Level code (A–D). Matches the primary level or a flexibility level. */
  @ApiPropertyOptional() @IsOptional() @IsString() level?: string;
  /** Weekday (Mon..Sun) the player marked available. */
  @ApiPropertyOptional({ enum: [...FREE_AGENT_DAYS] })
  @IsOptional()
  @IsIn([...FREE_AGENT_DAYS])
  day?: string;
  @ApiPropertyOptional({ enum: ["active", "placed", "withdrawn", "all"] })
  @IsOptional()
  @IsIn(["active", "placed", "withdrawn", "all"])
  status?: "active" | "placed" | "withdrawn" | "all";
}

class AdminOfferBodyDto {
  @ApiProperty() @IsUUID() teamId!: string;
}

/**
 * Admin view of the free-agent pool (CAP-10, UC-03 alternative flow
 * "Admin manually assigns player to a team"). Org / league / season /
 * division admins see the pools of the seasons their role covers
 * (shared/auth/visibility), never another org's. "Assign to team" makes
 * the same offer a captain makes; the player still accepts or declines.
 */
@ApiTags("registration-v2/free-agent-pool")
@ApiBearerAuth()
@Controller("registration-v2/admin/free-agent-pool")
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class FreeAgentPoolAdminController {
  constructor(
    private readonly svc: RegistrationV2Service,
    private readonly offers: FreeAgentOffersService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "Free agents in the seasons the caller administers, with position / level / day filters and each entry's open offers. `seasons` lists the seasons that have entries, for the season filter."
  })
  async list(@Query() q: AdminPoolQueryDto, @UserScope() scope: UserScopeType) {
    const visible = visibleSeasonIds(scope);
    const rows = await this.svc.listFreeAgentPool({
      visibleSeasons: visible,
      status: q.status ?? "active"
    });
    const seasons = new Map<string, string>();
    for (const r of rows) seasons.set(r.seasonId, r.seasonName ?? "Season");

    const items = rows.filter((r) => {
      if (q.seasonId && r.seasonId !== q.seasonId) return false;
      if (q.position && !r.positions.includes(q.position)) return false;
      if (q.level) {
        // Older rows hold C1 / C2 / C3; compare as A–D (REG-21).
        const want = normalizeSkillLevel(q.level);
        const levels = [r.levelPrimary, ...(r.levelFlexibility ?? [])].map((l) => normalizeSkillLevel(l));
        if (!want || !levels.includes(want)) return false;
      }
      if (q.day && !freeAgentAvailableDays(r.availability).includes(q.day as never)) return false;
      return true;
    });
    const open = await this.offers.openOffersByEntry(items.map((r) => r.id));
    return {
      items: items.map((r) => ({ ...r, openOffers: open.get(r.id) ?? [] })),
      seasons: [...seasons.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  @Get(":id/teams")
  @ApiOperation({
    summary:
      "Teams that can be offered this free agent: teams with a live division entry (applied / accepted / confirmed) in the entry's season, inside the caller's scope."
  })
  async teams(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UserScope() scope: UserScopeType
  ) {
    const entry = await this.loadVisibleEntry(id, scope);
    const teams = await this.offers.liveTeamsInSeason(entry.seasonId);
    return teams.filter((t) => orgVisible(scope, t.orgId));
  }

  @Post(":id/offers")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Assign to team: offer the free agent a spot on a team that plays the entry's season. Same offer, notification and accept / decline flow as a captain's offer; nothing is added to the roster until the player accepts."
  })
  async offer(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AdminOfferBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    const entry = await this.loadVisibleEntry(id, scope);
    const [team] = await this.db
      .select({ orgId: schema.teams.orgId })
      .from(schema.teams)
      .where(eq(schema.teams.id, body.teamId))
      .limit(1);
    if (!team || !orgVisible(scope, team.orgId)) {
      throw new NotFoundException("Team not found");
    }
    // A team that does not play the entry's season is refused inside
    // createOffer with a readable 409; scope is checked here first.
    return this.offers.createOffer({
      entryId: entry.id,
      teamId: body.teamId,
      actorUserId: user.userId,
      offeredBy: "admin"
    });
  }

  /** 404 (never 403) when the entry's season is outside the caller's scope. */
  private async loadVisibleEntry(id: string, scope: UserScopeType) {
    const [entry] = await this.db
      .select({
        id: schema.freeAgentPoolEntries.id,
        seasonId: schema.freeAgentPoolEntries.seasonId
      })
      .from(schema.freeAgentPoolEntries)
      .where(eq(schema.freeAgentPoolEntries.id, id))
      .limit(1);
    if (!entry || !(await seasonVisible(this.db, scope, entry.seasonId))) {
      throw new NotFoundException("Free agent not found");
    }
    return entry;
  }
}
