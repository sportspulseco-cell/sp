import {
  Body,
  Controller,
  BadRequestException,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import { and, eq, inArray, isNull, not, sql } from "drizzle-orm";
import {
  PREFERENCE_CHANNELS,
  PREFERENCE_CODES,
  PREFERENCE_TOPICS,
  TEMPLATE_CODES,
  type PreferenceChannel,
  type PreferenceTopic
} from "../domain/templates/catalog";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { loadUserScope } from "../../../shared/auth/scope";
import { userHasOrgAdminOnOrg } from "../../../shared/auth/org-admin";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository
} from "../domain/repositories/notification.repository";
import {
  NotificationDto,
  NotificationPageDto
} from "../application/dtos/notification.dto";
import {
  GetNotificationHandler,
  ListNotificationsHandler,
  RecentForPersonHandler
} from "../application/handlers/queries";
import {
  FlushQueuedHandler,
  RetryNotificationHandler
} from "../application/handlers/retry.handler";
import { ListNotificationsQueryDto } from "./dto/notification.dto";
import { notInboxDuplicate } from "../infrastructure/repositories/drizzle-notification.repository";

class SetPreferenceBodyDto {
  @IsBoolean() enabled!: boolean;
}

/**
 * Two surfaces:
 *   - super-admin outbox views (list / get / retry / flush) — locked
 *     behind SuperAdminGuard at the route level
 *   - "/me" surfaces — any authenticated user, scoped to their own
 *     person record so a player can mark their own notifications read
 *     without needing platform powers.
 */
@ApiTags("communications/notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly listH: ListNotificationsHandler,
    private readonly getH: GetNotificationHandler,
    private readonly recentH: RecentForPersonHandler,
    private readonly retryH: RetryNotificationHandler,
    private readonly flushH: FlushQueuedHandler,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // -------- super-admin outbox surfaces --------

  @Get()
  @ApiOperation({
    summary:
      "List outbox notifications (newest first). super_admin: any filter. org_admin: must pass an orgId they administer."
  })
  async list(
    @Query() q: ListNotificationsQueryDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<NotificationPageDto> {
    const scope = await loadUserScope(this.db, user.userId);
    if (!scope.isSuperAdmin) {
      if (!q.orgId || !(await userHasOrgAdminOnOrg(this.db, user.userId, q.orgId))) {
        throw new ForbiddenException(
          "Requires super_admin, or org_admin on the requested orgId. Players use GET /notifications/me."
        );
      }
    }
    return this.listH.execute(q);
  }

  @Get("for-person/:personId")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Recent notifications for a person" })
  forPerson(@Param("personId") personId: string): Promise<NotificationDto[]> {
    return this.recentH.execute({ personId });
  }

  @Post(":id/retry")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Send a queued/failed notification through the provider" })
  retry(@Param("id") id: string): Promise<NotificationDto> {
    return this.retryH.execute({ id });
  }

  @Post("flush")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Flush all currently queued notifications" })
  flush() {
    return this.flushH.execute();
  }

  /**
   * Cron-triggered retry sweep for `failed` notifications under the
   * 3-attempt cap with exponential backoff (5 min → 30 min). Hit by
   * the scheduler every ~5 min on this endpoint. P4-2 / P1-1 follow-on.
   */
  // -------- "/me" surfaces — any signed-in user --------

  @Get("me")
  @ApiOperation({
    summary:
      "The caller's own notifications (newest first). The player and captain inboxes read this."
  })
  async mine(
    @Query() q: ListNotificationsQueryDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<NotificationPageDto> {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) return { items: [], nextCursor: null } as NotificationPageDto;
    // The inbox is the in-app channel: a code the person switched off
    // in-app stays out of it, whichever channel the row went by.
    return this.listH.execute({
      limit: q.limit,
      cursor: q.cursor,
      status: q.status,
      templateCode: q.templateCode,
      excludeTemplateCodes: await this.inAppMutedCodes(user.userId),
      recipientPersonId: personId,
      inbox: true
    });
  }

  @Get("me/unread-count")
  @ApiOperation({
    summary:
      "Unread notification count for the current user. Used by topbar bell badge."
  })
  async myUnreadCount(
    @CurrentUser() user: AuthPrincipal
  ): Promise<{ unread: number }> {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) return { unread: 0 };
    const muted = await this.inAppMutedCodes(user.userId);
    const [row] = await this.db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientPersonId, personId),
          isNull(schema.notifications.readAt),
          notInboxDuplicate(),
          ...(muted.length ? [not(inArray(schema.notifications.templateCode, muted))] : [])
        )
      );
    return { unread: Number(row?.c ?? 0) };
  }

  @Post(":id/read")
  @ApiOperation({
    summary: "Mark a single notification as read (recipient-only)."
  })
  async markRead(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<NotificationDto> {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) throw new NotFoundException("Notification");
    const row = await this.repo.markRead(id, personId);
    if (!row) throw new NotFoundException("Notification");
    return NotificationDto.fromRow(row);
  }

  @Post("me/read-all")
  @ApiOperation({
    summary: "Mark every unread notification for the current user as read."
  })
  async markAllRead(
    @CurrentUser() user: AuthPrincipal
  ): Promise<{ updated: number }> {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) return { updated: 0 };
    return this.repo.markAllReadForPerson(personId);
  }

  /**
   * The signed-in user's notification preferences. `items` holds every
   * (templateCode, channel) the user has explicitly set; anything missing
   * is on. `topics` is the catalog the settings page renders (one row per
   * topic, each covering one or more codes), so the page never carries
   * its own copy of the code list.
   */
  @Get("me/preferences")
  @ApiOperation({
    summary:
      "The caller's opt-outs plus the catalog of topics they can switch off per channel. Absence of a row = on."
  })
  async myPreferences(@CurrentUser() user: AuthPrincipal): Promise<{
    items: Array<{ templateCode: string; channel: string; enabled: boolean }>;
    topics: PreferenceTopic[];
    channels: readonly PreferenceChannel[];
    templates: string[];
  }> {
    const rows = await this.db
      .select({
        templateCode: schema.notificationPreferences.templateCode,
        channel: schema.notificationPreferences.channel,
        enabled: schema.notificationPreferences.enabled
      })
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, user.userId));
    return {
      items: rows,
      topics: PREFERENCE_TOPICS,
      channels: PREFERENCE_CHANNELS,
      templates: [...TEMPLATE_CODES]
    };
  }

  /**
   * Switch one topic on or off for one channel: every code in the topic
   * is written in one transaction, so the row never ends half on.
   */
  @Put("me/preferences/topics/:topicKey/:channel")
  @ApiOperation({
    summary:
      "Set one topic (all of its template codes) on or off for one channel. Body: { enabled }. Channel: email | in_app."
  })
  async setTopicPreference(
    @CurrentUser() user: AuthPrincipal,
    @Param("topicKey") topicKey: string,
    @Param("channel") channel: string,
    @Body() body: SetPreferenceBodyDto
  ): Promise<{ topicKey: string; channel: string; enabled: boolean; codes: string[] }> {
    const topic = PREFERENCE_TOPICS.find((t) => t.key === topicKey);
    if (!topic) throw new NotFoundException(`Unknown notification topic: ${topicKey}`);
    this.assertChannel(channel);
    await this.db.transaction(async (tx) => {
      for (const code of topic.codes) {
        await this.upsertPreference(tx as unknown as Database, user.userId, code, channel, body.enabled);
      }
    });
    return { topicKey, channel, enabled: body.enabled, codes: topic.codes };
  }

  /** Upsert one (templateCode, channel) cell. Kept for single-code callers. */
  @Put("me/preferences/:templateCode/:channel")
  @ApiOperation({
    summary:
      "Upsert a single preference cell. PUT body: { enabled: boolean }. Channel: email | in_app. Code must be one a person can switch off."
  })
  async setPreference(
    @CurrentUser() user: AuthPrincipal,
    @Param("templateCode") templateCode: string,
    @Param("channel") channel: string,
    @Body() body: SetPreferenceBodyDto
  ): Promise<{ templateCode: string; channel: string; enabled: boolean }> {
    if (!PREFERENCE_CODES.has(templateCode)) {
      throw new NotFoundException(`Unknown or required notification: ${templateCode}`);
    }
    this.assertChannel(channel);
    await this.upsertPreference(this.db, user.userId, templateCode, channel, body.enabled);
    return { templateCode, channel, enabled: body.enabled };
  }

  private assertChannel(channel: string): asserts channel is PreferenceChannel {
    if (!(PREFERENCE_CHANNELS as readonly string[]).includes(channel)) {
      throw new BadRequestException(
        `channel must be one of ${PREFERENCE_CHANNELS.join(", ")}`
      );
    }
  }

  private async upsertPreference(
    db: Database,
    userId: string,
    templateCode: string,
    channel: string,
    enabled: boolean
  ) {
    await db
      .insert(schema.notificationPreferences)
      .values({ userId, templateCode, channel, enabled })
      .onConflictDoUpdate({
        target: [
          schema.notificationPreferences.userId,
          schema.notificationPreferences.templateCode,
          schema.notificationPreferences.channel
        ],
        set: { enabled, updatedAt: new Date() }
      });
  }

  // Get-one is open to recipients OR super_admin.
  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<NotificationDto> {
    const dto = await this.getH.execute({ id });
    const personId = await this.resolvePersonId(user.userId);
    if (dto.recipientPersonId && dto.recipientPersonId === personId) {
      return dto;
    }
    const [profile] = await this.db
      .select({ isSuperAdmin: schema.profiles.isSuperAdmin })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.userId))
      .limit(1);
    if (profile?.isSuperAdmin) return dto;
    throw new NotFoundException("Notification");
  }

  /** Codes the user switched off for the in-app channel. */
  private async inAppMutedCodes(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: schema.notificationPreferences.templateCode })
      .from(schema.notificationPreferences)
      .where(
        and(
          eq(schema.notificationPreferences.userId, userId),
          eq(schema.notificationPreferences.channel, "in_app"),
          eq(schema.notificationPreferences.enabled, false)
        )
      );
    return rows.map((r) => r.code);
  }

  private async resolvePersonId(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    return row?.id ?? null;
  }
}
