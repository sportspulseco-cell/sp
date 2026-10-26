import { SKILL_LEVELS } from "@sportspulse/kernel";
import {
  BadRequestException,
  Body,
  Controller,
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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID
} from "class-validator";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import { loadAdminScope, type UserScope as UserScopeType } from "../../../shared/auth/scope";
import { RegistrationV2Service } from "../application/registration-v2.service";
import { FreeAgentOffersService } from "../application/free-agent-offers.service";

class UpsertFreeAgentBodyDto {
  @ApiProperty() @IsUUID() playerPersonId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true })
  positions!: string[];
  @ApiPropertyOptional() @IsOptional() availability?: Record<string, unknown>;
  /** A–D (REG-21); C1 / C2 / C3 from older clients are mapped on save. */
  @ApiProperty({ enum: [...SKILL_LEVELS] })
  @IsIn([...SKILL_LEVELS, "C1", "C2", "C3"])
  levelPrimary!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  levelFlexibility?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class PlaceFreeAgentBodyDto {
  @ApiProperty() @IsUUID() teamId!: string;
}

class ListTeamOffersQueryDto {
  @ApiProperty() @IsUUID() teamId!: string;
}

class ListFreeAgentsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  /**
   * Captain helper — server resolves the team's currently-active division
   * entry, then returns the pool for that division's season. Use either
   * seasonId OR forTeamId, not both.
   */
  @ApiPropertyOptional() @IsOptional() @IsUUID() forTeamId?: string;
}

@ApiTags("registration-v2/free-agent-pool")
@ApiBearerAuth()
@Controller("registration-v2/free-agent-pool")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class FreeAgentPoolController {
  constructor(
    private readonly svc: RegistrationV2Service,
    private readonly offers: FreeAgentOffersService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "List active free agents (filter by season). With forTeamId (captains): every season the team plays, each entry with this team's latest offer (`teamOffer`)."
  })
  async list(
    @Query() q: ListFreeAgentsQueryDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    // Captains hit this from /captain/free-agents with `forTeamId`. The
    // caller must captain the team: `scope.teamIds` also holds the teams
    // a player is rostered on, which used to open the pool (names,
    // emails, birth dates) to any rostered player.
    if (q.forTeamId) {
      await this.requireCaptain(user.userId, q.forTeamId);
      const [entries, teamOffers] = await Promise.all([
        this.svc.listFreeAgentPool({ forTeamId: q.forTeamId }),
        this.offers.listTeamOffers(q.forTeamId)
      ]);
      // Newest offer from this team per entry (offers are newest first).
      const latest = new Map<string, (typeof teamOffers)[number]>();
      for (const o of teamOffers) if (!latest.has(o.entryId)) latest.set(o.entryId, o);
      return entries.map((e) => ({ ...e, teamOffer: latest.get(e.id) ?? null }));
    }

    // Require seasonId for non-super-admin callers so we can scope-check
    // the result set. The free-agent pool exposes player PII + skill
    // levels; without a seasonId we'd return the entire platform pool.
    if (!scope.isSuperAdmin) {
      // Admin roles only: a rostered player's scope also carries their
      // team's org, which must not open the pool's PII to them.
      const admin = await loadAdminScope(this.db, user.userId);
      if (!q.seasonId) {
        throw new BadRequestException(
          "seasonId or forTeamId is required for non-super-admin callers"
        );
      }
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
        admin.leagueIds === null || admin.leagueIds.includes(season.leagueId);
      const inOrgScope =
        admin.orgIds === null || admin.orgIds.includes(season.orgId);
      if (!inLeagueScope && !inOrgScope) {
        throw new NotFoundException(`Season not found: ${q.seasonId}`);
      }
    }
    return this.svc.listFreeAgentPool({ seasonId: q.seasonId });
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({ summary: "Upsert a free agent entry (one per player+season)" })
  async upsert(
    @Body() body: UpsertFreeAgentBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    // A player writes their own entry. Anyone else must be an admin over
    // the season (super admin, or league/org scope); otherwise 404, so the
    // endpoint never confirms another person's entry exists.
    const [own] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(
        and(
          eq(schema.persons.id, body.playerPersonId),
          eq(schema.persons.userId, user.userId),
          isNull(schema.persons.deletedAt)
        )
      )
      .limit(1);
    if (!own && !scope.isSuperAdmin) {
      const [season] = await this.db
        .select({ leagueId: schema.seasons.leagueId, orgId: schema.seasons.orgId })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, body.seasonId))
        .limit(1);
      const reach = await loadAdminScope(this.db, user.userId);
      const admin =
        !!season &&
        (reach.leagueIds === null ||
          reach.leagueIds.includes(season.leagueId) ||
          reach.orgIds === null ||
          reach.orgIds.includes(season.orgId));
      if (!admin) {
        console.warn(
          `[free-agent-pool] refused upsert by user=${user.userId} for person=${body.playerPersonId} season=${body.seasonId}`
        );
        throw new NotFoundException(`Player not found: ${body.playerPersonId}`);
      }
    }
    return this.svc.upsertFreeAgentEntry({
      playerPersonId: body.playerPersonId,
      seasonId: body.seasonId,
      positions: body.positions,
      availability: body.availability ?? {},
      levelPrimary: body.levelPrimary,
      levelFlexibility: body.levelFlexibility,
      note: body.note
    });
  }

  @Post(":id/offers")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Captain offers a free agent a spot on their team (UC-03, CAP-9). Creates a personal team invite linked to the pool entry and notifies the player (email + in-app); the player accepts or declines on player-web. Nothing is added to the roster here. Returns the existing open offer when this team already made one. 409 when the player left the pool, the team does not play the entry's season, the roster is locked or the player is already on the team."
  })
  async offer(
    @Param("id") id: string,
    @Body() body: PlaceFreeAgentBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    await this.requireCaptain(user.userId, body.teamId);
    return this.offers.createOffer({
      entryId: id,
      teamId: body.teamId,
      actorUserId: user.userId,
      offeredBy: "captain"
    });
  }

  @Patch(":id/place")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Deprecated alias of POST :id/offers. It used to put the player straight on the roster without asking them (CAP-9); it now makes the same offer."
  })
  async place(
    @Param("id") id: string,
    @Body() body: PlaceFreeAgentBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    await this.requireCaptain(user.userId, body.teamId);
    return this.offers.createOffer({
      entryId: id,
      teamId: body.teamId,
      actorUserId: user.userId,
      offeredBy: "captain"
    });
  }

  @Get("mine")
  @ApiOperation({
    summary:
      "The caller's own pool entries in every season and status (active, placed, withdrawn), for the player's free-agent form (CAP-17)."
  })
  async mine(@CurrentUser() user: AuthPrincipal) {
    const people = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(and(eq(schema.persons.userId, user.userId), isNull(schema.persons.deletedAt)));
    return this.svc.listFreeAgentPool({ playerPersonIds: people.map((p) => p.id), status: "all" });
  }

  @Get("offers")
  @ApiOperation({
    summary:
      "A team's free-agent offers with their state (Offer sent / Accepted / Declined / Expired / Withdrawn), newest first. Captain of the team only."
  })
  async listOffers(
    @Query() q: ListTeamOffersQueryDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    await this.requireCaptain(user.userId, q.teamId);
    return this.offers.listTeamOffers(q.teamId);
  }

  /** Captain of the team (or super admin, per userIsCaptainOfTeam). 404 otherwise, never leaking the team. */
  private async requireCaptain(userId: string, teamId: string): Promise<void> {
    const ok = await userIsCaptainOfTeam(this.db, userId, teamId);
    if (!ok) throw new NotFoundException(`Team not found: ${teamId}`);
  }
}
