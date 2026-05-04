import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
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

@ApiTags("communications/notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class NotificationsController {
  constructor(
    private readonly listH: ListNotificationsHandler,
    private readonly getH: GetNotificationHandler,
    private readonly recentH: RecentForPersonHandler,
    private readonly retryH: RetryNotificationHandler,
    private readonly flushH: FlushQueuedHandler
  ) {}

  @Get() @ApiOperation({ summary: "List outbox notifications (newest first)" })
  list(@Query() q: ListNotificationsQueryDto): Promise<NotificationPageDto> {
    return this.listH.execute(q);
  }

  @Get("for-person/:personId")
  @ApiOperation({ summary: "Recent notifications for a person" })
  forPerson(
    @Param("personId") personId: string
  ): Promise<NotificationDto[]> {
    return this.recentH.execute({ personId });
  }

  @Get(":id") get(@Param("id") id: string): Promise<NotificationDto> {
    return this.getH.execute({ id });
  }

  @Post(":id/retry")
  @ApiOperation({ summary: "Send a queued/failed notification through the provider" })
  retry(@Param("id") id: string): Promise<NotificationDto> {
    return this.retryH.execute({ id });
  }

  @Post("flush")
  @ApiOperation({ summary: "Flush all currently queued notifications" })
  flush() {
    return this.flushH.execute();
  }
}
