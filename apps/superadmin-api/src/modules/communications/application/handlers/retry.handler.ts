import { Inject, Injectable } from "@nestjs/common";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository
} from "../../domain/repositories/notification.repository";
import { NotificationService } from "../notification.service";
import { ConsoleNotificationProvider } from "../../infrastructure/providers/console-provider";
import {
  NotificationDto
} from "../dtos/notification.dto";

@Injectable()
export class RetryNotificationHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService,
    private readonly provider: ConsoleNotificationProvider
  ) {}

  async execute({ id }: { id: string }): Promise<NotificationDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new Error("notification not found");
    if (row.status === "sent")
      return NotificationDto.fromRow(row);

    try {
      await this.provider.send(row);
      const updated = await this.service.markSent(id);
      return NotificationDto.fromRow(updated);
    } catch (err) {
      const updated = await this.service.markFailed(
        id,
        (err as Error).message
      );
      return NotificationDto.fromRow(updated);
    }
  }
}

@Injectable()
export class FlushQueuedHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService,
    private readonly provider: ConsoleNotificationProvider
  ) {}

  /** Send everything currently queued. Returns count sent + failed. */
  async execute(): Promise<{ sent: number; failed: number }> {
    const page = await this.repo.list({ status: "queued", limit: 100 });
    let sent = 0;
    let failed = 0;
    for (const row of page.items) {
      try {
        await this.provider.send(row);
        await this.service.markSent(row.id);
        sent++;
      } catch (err) {
        await this.service.markFailed(row.id, (err as Error).message);
        failed++;
      }
    }
    return { sent, failed };
  }
}
