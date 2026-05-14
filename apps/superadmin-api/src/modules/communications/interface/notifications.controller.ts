import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
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
  RetryFailedHandler,
  RetryNotificationHandler
} from "../application/handlers/retry.handler";
import { ListNotificationsQueryDto } from "./dto/notification.dto";

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
    private readonly retryFailedH: RetryFailedHandler,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // -------- super-admin outbox surfaces --------

  @Get()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "List outbox notifications (newest first)" })
  list(@Query() q: ListNotificationsQueryDto): Promise<NotificationPageDto> {
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
  @Post("cron/retry-failed")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Retry every failed notification under the 3-attempt cap whose last attempt is older than the backoff window. Idempotent; safe to call on a short cadence."
  })
  retryFailed() {
    return this.retryFailedH.execute();
  }

  // -------- "/me" surfaces — any signed-in user --------

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
    const [row] = await this.db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientPersonId, personId),
          isNull(schema.notifications.readAt)
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

  private async resolvePersonId(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    return row?.id ?? null;
  }
}
