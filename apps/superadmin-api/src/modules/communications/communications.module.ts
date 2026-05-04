import { Module } from "@nestjs/common";
import { NotificationsController } from "./interface/notifications.controller";
import { NotificationTemplatesController } from "./interface/templates.controller";
import { NotificationService } from "./application/notification.service";
import {
  GetNotificationHandler,
  ListNotificationsHandler,
  RecentForPersonHandler
} from "./application/handlers/queries";
import {
  FlushQueuedHandler,
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
import { ConsoleNotificationProvider } from "./infrastructure/providers/console-provider";

@Module({
  controllers: [NotificationsController, NotificationTemplatesController],
  providers: [
    ListNotificationsHandler,
    GetNotificationHandler,
    RecentForPersonHandler,
    RetryNotificationHandler,
    FlushQueuedHandler,
    ListTemplatesHandler,
    GetTemplateHandler,
    UpsertTemplateHandler,
    DeleteTemplateHandler,
    NotificationService,
    ConsoleNotificationProvider,
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
