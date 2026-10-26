import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength
} from "class-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { holdsRoleInOrg } from "../../../shared/auth/org-permission";
import { ADMIN_SCOPE_ROLE_CODES } from "../../../shared/auth/scope";
import {
  announcementOrgs,
  announcementReach,
  reachHolds,
  reachIsEmpty
} from "../../../shared/audience/announcement-reach";
import {
  assertTargetInOrg,
  ORG_TARGET_TYPES,
  type OrgTargetType,
  teamIdsInTarget
} from "../../../shared/audience/org-targets";
import { NotificationService } from "../../communications/application/notification.service";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_CHANNELS,
  resolveAnnouncementRecipients,
  sendAnnouncement,
  type AnnouncementAudience,
  type AnnouncementChannel,
  type AnnouncementTarget
} from "../../../shared/audience/announcements";

const AUDIENCES = ANNOUNCEMENT_AUDIENCES;
type Audience = AnnouncementAudience;
const CHANNELS = ANNOUNCEMENT_CHANNELS;
type Channel = AnnouncementChannel;

class BroadcastBodyDto {
  @IsUUID() orgId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(AUDIENCES as unknown as string[], { each: true })
  audiences!: Audience[];
  /** Part of the org to reach. Default: the whole org. */
  @IsOptional()
  @IsIn(ORG_TARGET_TYPES)
  targetType?: OrgTargetType;
  /** League / season / division / team id. Ignored for the whole org. */
  @IsOptional() @IsUUID() targetId?: string;
  @IsString() @Length(1, 200) subject!: string;
  @IsString() @Length(1, 5000) @MaxLength(5000) body!: string;
  /** One or more channels; one notification per recipient per channel. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(CHANNELS as unknown as string[], { each: true })
  channels?: Channel[];
  /** Older clients send a single channel. */
  @IsOptional() @IsIn(CHANNELS as unknown as string[]) channel?: Channel;
  /**
   * One key per composed announcement. A retry or double click with the
   * same key returns the first result instead of sending again.
   */
  @IsOptional() @IsUUID() idempotencyKey?: string;
}

type TargetScope = AnnouncementTarget;

class TargetsQueryDto {
  /** The org to list targets for. Default: the first org the caller can reach. */
  @IsOptional() @IsUUID() orgId?: string;
}

/**
 * League announcement (UC-19). An org admin or a league admin (any role
 * granting `communication.send`) picks who (captains, coaches, players,
 * referees, admins), where (whole org, a league, season, division or
 * team: real entities picked from lists, never typed ids), and how
 * (email, in-app, or both).
 *
 * The server owns the recipient list: the target must sit in the org
 * (404 otherwise) and inside the caller's reach (announcement-reach.ts:
 * a league admin reaches their own leagues and below, never the whole
 * org or a sibling league; 404 outside it). Every recipient is
 * resolved from that target inside the org. Each recipient gets one
 * notification per channel, idempotent on
 * `broadcast-<key>-<personId>-<channel>`.
 *
 * Not built (no model yet): schedule for later, attachments, SMS, push.
 */
@ApiTags("org-admin/broadcast")
@ApiBearerAuth()
@Controller("org-admin/broadcast")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminBroadcastController {
  private readonly log = new Logger(OrgAdminBroadcastController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Get("targets")
  @ApiOperation({
    summary:
      "Where the caller may send an announcement: the orgs they reach and, for one org, the leagues, seasons, divisions and teams. Same rule as the send check."
  })
  async targets(@Query() q: TargetsQueryDto, @CurrentUser() user: AuthPrincipal) {
    const orgs = await announcementOrgs(this.db, user.userId);
    const orgId = q.orgId ?? orgs[0]?.id ?? null;
    if (!orgId) return { orgs, reach: null };
    if (q.orgId && !orgs.some((o) => o.id === q.orgId)) {
      throw new NotFoundException("Org not found");
    }
    const reach = await announcementReach(this.db, user.userId, orgId);
    this.log.log(
      `broadcast.targets user=${user.userId} org=${orgId} wholeOrg=${reach.wholeOrg} leagues=${reach.leagues.length} teams=${reach.teams.length}`
    );
    return { orgs, reach };
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Send an announcement to chosen audiences in the whole org or one league / season / division / team of it, on one or more channels. Recipients are resolved on the server inside the caller's org. Idempotent on idempotencyKey."
  })
  async broadcast(
    @Body() body: BroadcastBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const targetType: OrgTargetType = body.targetType ?? "org";
    const targetId = targetType === "org" ? body.orgId : body.targetId;
    if (!targetId) {
      throw new BadRequestException(`Pick the ${targetType} to send to.`);
    }
    await assertTargetInOrg(this.db, targetType, targetId, body.orgId);
    if (!scope.isSuperAdmin) {
      const reach = await announcementReach(this.db, user.userId, body.orgId);
      if (reachIsEmpty(reach)) {
        if (await holdsRoleInOrg(this.db, user.userId, body.orgId, ADMIN_SCOPE_ROLE_CODES)) {
          throw new ForbiddenException(
            "Your role cannot send announcements here. Ask your org admin."
          );
        }
        throw new NotFoundException("Org not found");
      }
      if (!reachHolds(reach, targetType, targetId)) {
        if (targetType === "org") {
          throw new ForbiddenException(
            "You can send to your own leagues, not the whole organisation. Pick one of your leagues."
          );
        }
        throw new NotFoundException("Target not found");
      }
    }

    const channels: Channel[] = Array.from(
      new Set(body.channels ?? (body.channel ? [body.channel] : []))
    );
    if (channels.length === 0) {
      throw new BadRequestException("Pick at least one channel.");
    }
    const audiences = Array.from(new Set(body.audiences));
    return sendAnnouncement(this.db, this.notify, this.log, {
      orgId: body.orgId,
      idempotencyKey: body.idempotencyKey,
      channels,
      recipients: async () =>
        resolveAnnouncementRecipients(
          this.db,
          await this.targetScope(targetType, targetId, body.orgId),
          body.orgId,
          audiences
        ),
      payload: { subject: body.subject, body: body.body, targetType, targetId, audiences },
      sourceEvent: "org.broadcast",
      describe: `org=${body.orgId} target=${targetType}:${targetId} audiences=${audiences.join(",")}`
    });
  }

  /** Teams, leagues, seasons and divisions that sit under the target. */
  private async targetScope(
    type: OrgTargetType,
    targetId: string,
    orgId: string
  ): Promise<TargetScope> {
    const teamIds = await teamIdsInTarget(this.db, type, targetId, orgId);

    if (type === "org") {
      const leagues = await this.db
        .select({ id: schema.leagues.id })
        .from(schema.leagues)
        .where(eq(schema.leagues.orgId, orgId));
      const seasons = await this.db
        .select({ id: schema.seasons.id })
        .from(schema.seasons)
        .where(eq(schema.seasons.orgId, orgId));
      const divisions = seasons.length
        ? await this.db
            .select({ id: schema.divisions.id })
            .from(schema.divisions)
            .where(inArray(schema.divisions.seasonId, seasons.map((s) => s.id)))
        : [];
      return {
        teamIds,
        leagueIds: leagues.map((l) => l.id),
        seasonIds: seasons.map((s) => s.id),
        divisionIds: divisions.map((d) => d.id)
      };
    }

    // Divisions under the target, with their season and league.
    const where =
      type === "league"
        ? eq(schema.seasons.leagueId, targetId)
        : type === "season"
          ? eq(schema.divisions.seasonId, targetId)
          : type === "division"
            ? eq(schema.divisions.id, targetId)
            : teamIds.length
              ? inArray(
                  schema.divisions.id,
                  this.db
                    .select({ id: schema.divisionTeamEntries.divisionId })
                    .from(schema.divisionTeamEntries)
                    .where(
                      and(
                        inArray(schema.divisionTeamEntries.teamId, teamIds),
                        inArray(schema.divisionTeamEntries.entryStatus, [
                          "applied",
                          "confirmed"
                        ])
                      )
                    )
                )
              : sql`false`;
    const rows = await this.db
      .select({
        divisionId: schema.divisions.id,
        seasonId: schema.seasons.id,
        leagueId: schema.seasons.leagueId
      })
      .from(schema.divisions)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(and(where, eq(schema.seasons.orgId, orgId)));

    const leagueIds = new Set(rows.map((r) => r.leagueId));
    const seasonIds = new Set(rows.map((r) => r.seasonId));
    if (type === "league") {
      leagueIds.add(targetId);
      const seasons = await this.db
        .select({ id: schema.seasons.id })
        .from(schema.seasons)
        .where(eq(schema.seasons.leagueId, targetId));
      for (const x of seasons) seasonIds.add(x.id);
    }
    if (type === "season") {
      seasonIds.add(targetId);
      const [s] = await this.db
        .select({ leagueId: schema.seasons.leagueId })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, targetId))
        .limit(1);
      if (s) leagueIds.add(s.leagueId);
    }
    return {
      teamIds,
      leagueIds: [...leagueIds],
      seasonIds: [...seasonIds],
      divisionIds: rows.map((r) => r.divisionId)
    };
  }
}
