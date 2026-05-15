import { Module } from "@nestjs/common";
import { NotificationsController } from "./interface/notifications.controller";
import { NotificationsCronController } from "./interface/notifications-cron.controller";
import { NotificationTemplatesController } from "./interface/templates.controller";
import { PushSubscriptionsController } from "./interface/push-subscriptions.controller";
import { CronSecretGuard } from "../../shared/auth/guards/cron-secret.guard";
import { NotificationService } from "./application/notification.service";
import {
  GetNotificationHandler,
  ListNotificationsHandler,
  RecentForPersonHandler
} from "./application/handlers/queries";
import {
  FlushQueuedHandler,
  RetryFailedHandler,
  RetryNotificationHandler
} from "./application/handlers/retry.handler";
import {
  DeleteTemplateHandler,
  GetTemplateHandler,
  ListTemplatesHandler,
  UpsertTemplateHandler
} from "./application/handlers/templates";
import { NOTIFICATION_REPOSITORY } from "./domain/repositories/notification.repository";
import { NOTIFICATION_TEMPLATE_REPOSITORY } from "./domain/repositories/template.repository";
import { DrizzleNotificationRepository } from "./infrastructure/repositories/drizzle-notification.repository";
import { DrizzleNotificationTemplateRepository } from "./infrastructure/repositories/drizzle-template.repository";

@Module({
  controllers: [
    NotificationsController,
    NotificationsCronController,
    NotificationTemplatesController,
    PushSubscriptionsController
  ],
  providers: [
    CronSecretGuard,
    ListNotificationsHandler,
    GetNotificationHandler,
    RecentForPersonHandler,
    RetryNotificationHandler,
    FlushQueuedHandler,
    RetryFailedHandler,
    ListTemplatesHandler,
    GetTemplateHandler,
    UpsertTemplateHandler,
    DeleteTemplateHandler,
    NotificationService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: DrizzleNotificationRepository
    },
    {
      provide: NOTIFICATION_TEMPLATE_REPOSITORY,
      useClass: DrizzleNotificationTemplateRepository
    }
  ],
  exports: [NotificationService]
})
export class CommunicationsModule {}
