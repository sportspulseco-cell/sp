import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength
} from "class-validator";
import type { Database } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";
import { announcementOrgs, announcementReach } from "../../../shared/audience/announcement-reach";
import { ORG_TARGET_TYPES, type OrgTargetType } from "../../../shared/audience/org-targets";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_CHANNELS,
  type AnnouncementAudience,
  type AnnouncementChannel
} from "../../../shared/audience/announcements";
import { BroadcastService, apiPublicBase } from "../application/broadcast.service";

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
  /**
   * Schedule for later (UC-19): an ISO time at least 2 minutes and at
   * most 180 days ahead. Needs idempotencyKey. Omit to send now.
   */
  @IsOptional() @IsISO8601({ strict: true }) sendAt?: string;
  /** Files uploaded first through POST /org-admin/broadcast/attachments. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID("4", { each: true })
  attachmentIds?: string[];
}

class AttachmentUploadDto {
  @IsUUID() orgId!: string;
  @IsString() @Length(1, 200) fileName!: string;
  /** The file, base64. Up to 3 MB decoded; PDF, PNG, JPEG or WebP (checked by its bytes). */
  @IsString() @MaxLength(4_300_000) dataBase64!: string;
}

class ScheduledListQueryDto {
  @IsUUID() orgId!: string;
}


class TargetsQueryDto {
  /** The org to list targets for. Default: the first org the caller can reach. */
  @IsOptional() @IsUUID() orgId?: string;
}

/**
 * League announcement (UC-19). An org admin or a league admin (any role
 * granting `communication.send`) picks who (captains, coaches, players,
 * referees, admins), where (whole org, a league, season, division or
 * team: real entities picked from lists, never typed ids), how (email,
 * in-app or both; people who turned on text or push for Announcements
 * also get those copies), when (now, or a scheduled time a durable job
 * honours, cancellable until it goes) and with what (up to 5 files in a
 * private bucket, linked in the message by signed links).
 *
 * The server owns the recipient list: the target must sit in the org
 * (404 otherwise) and inside the caller's reach (announcement-reach.ts:
 * a league admin reaches their own leagues and below, never the whole
 * org or a sibling league; 404 outside it), at compose time and again at
 * send time. Each recipient gets one notification per channel,
 * idempotent on `broadcast-<key>-<personId>-<channel>`.
 */
@ApiTags("org-admin/broadcast")
@ApiBearerAuth()
@Controller("org-admin/broadcast")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminBroadcastController {
  private readonly log = new Logger(OrgAdminBroadcastController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly broadcasts: BroadcastService,
    @Inject(ConfigService) private readonly config: ConfigService
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
      "Send an announcement now, or with sendAt schedule it for later. Chosen audiences in the whole org or one league / season / division / team of it, on one or more channels, with optional attachments. Recipients are resolved on the server inside the caller's org at send time. Idempotent on idempotencyKey."
  })
  async broadcast(
    @Body() body: BroadcastBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType,
    @Req() req: Request
  ) {
    const targetType: OrgTargetType = body.targetType ?? "org";
    const targetId = targetType === "org" ? body.orgId : body.targetId;
    if (!targetId) {
      throw new BadRequestException(`Pick the ${targetType} to send to.`);
    }
    await this.broadcasts.assertCanSend(user.userId, scope.isSuperAdmin, body.orgId, targetType, targetId);

    const channels: Channel[] = Array.from(
      new Set(body.channels ?? (body.channel ? [body.channel] : []))
    );
    if (channels.length === 0) {
      throw new BadRequestException("Pick at least one channel.");
    }
    const request = {
      orgId: body.orgId,
      audiences: Array.from(new Set(body.audiences)),
      targetType,
      targetId,
      subject: body.subject,
      body: body.body,
      channels,
      attachmentIds: body.attachmentIds ?? []
    };
    if (body.sendAt) {
      if (!body.idempotencyKey) throw new BadRequestException("A scheduled announcement needs its idempotencyKey.");
      const res = await this.broadcasts.schedule({
        userId: user.userId,
        request,
        idempotencyKey: body.idempotencyKey,
        sendAt: new Date(body.sendAt)
      });
      // `id` / `orgId` for the audit interceptor.
      return { id: res.scheduled.id, orgId: body.orgId, scheduled: res.scheduled, idempotent: res.idempotent };
    }
    return this.broadcasts.sendNow({
      userId: user.userId,
      request,
      idempotencyKey: body.idempotencyKey,
      publicBase: apiPublicBase(this.config, req as unknown as Parameters<typeof apiPublicBase>[1])
    });
  }

  @Get("scheduled")
  @ApiOperation({ summary: "Scheduled announcements of one org the caller reaches: waiting, sending, failed, and those sent or cancelled in the last 7 days." })
  scheduled(@Query() q: ScheduledListQueryDto, @CurrentUser() user: AuthPrincipal, @UserScope() scope: UserScopeType) {
    return this.broadcasts.listScheduled(user.userId, scope.isSuperAdmin, q.orgId).then((items) => ({ items }));
  }

  @Get("scheduled/:id")
  @ApiOperation({ summary: "One scheduled announcement. 404 outside the caller's reach." })
  scheduledOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    return this.broadcasts.getScheduledFor(user.userId, scope.isSuperAdmin, id);
  }

  @Post("scheduled/:id/cancel")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Cancel a scheduled announcement before it goes. 409 once sending started or it was sent." })
  async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const row = await this.broadcasts.cancel(user.userId, scope.isSuperAdmin, id);
    return { id: row.id, orgId: row.orgId, scheduled: row };
  }

  @Post("attachments")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Upload one file for an announcement (PDF, PNG, JPEG or WebP, up to 3 MB, type checked by its bytes) to the private broadcast-attachments bucket. Then pass its id in attachmentIds."
  })
  upload(@Body() body: AttachmentUploadDto, @CurrentUser() user: AuthPrincipal, @UserScope() scope: UserScopeType) {
    return this.broadcasts.uploadAttachment({
      userId: user.userId,
      isSuperAdmin: scope.isSuperAdmin,
      orgId: body.orgId,
      fileName: body.fileName,
      dataBase64: body.dataBase64
    });
  }

  @Delete("attachments/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Remove an uploaded file that is not part of a sent or scheduled announcement." })
  removeAttachment(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    return this.broadcasts.removeAttachment(user.userId, scope.isSuperAdmin, id);
  }
}

/**
 * Routes with no user session: the cron job (X-Cron-Secret) and the
 * signed attachment links in sent messages.
 */
@ApiTags("org-admin/broadcast")
@Controller()
export class BroadcastJobsController {
  constructor(
    private readonly broadcasts: BroadcastService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Post("org-admin/broadcast/cron/due")
  @UseGuards(CronSecretGuard)
  @ApiOperation({ summary: "Durable job (pg_cron every minute, 0087): send scheduled announcements whose time has come." })
  due(@Req() req: Request) {
    return this.broadcasts.runDue(apiPublicBase(this.config, req as unknown as Parameters<typeof apiPublicBase>[1]));
  }

  @Get("public/broadcast-attachments/:id")
  @ApiOperation({ summary: "Open an announcement attachment from its signed link: 302 to a 5-minute private storage URL. 404 for a bad or expired link." })
  async open(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("e") e: string,
    @Query("s") s: string,
    @Res() res: Response
  ) {
    const url = await this.broadcasts.openSignedAttachment(id, e, s);
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, url);
  }
}
