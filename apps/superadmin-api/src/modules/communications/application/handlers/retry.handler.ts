import { Inject, Injectable } from "@nestjs/common";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository
} from "../../domain/repositories/notification.repository";
import { NotificationService } from "../notification.service";
import {
  NotificationDto
} from "../dtos/notification.dto";

@Injectable()
export class RetryNotificationHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService
  ) {}

  async execute({ id }: { id: string }): Promise<NotificationDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new Error("notification not found");
    if (row.status === "sent") return NotificationDto.fromRow(row);

    await this.service.dispatch(row);
    const updated = (await this.repo.findById(id)) ?? row;
    return NotificationDto.fromRow(updated);
  }
}

@Injectable()
export class FlushQueuedHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService
  ) {}

  /** Send everything currently queued. Returns count sent + failed. */
  async execute(): Promise<{ sent: number; failed: number }> {
    const page = await this.repo.list({ status: "queued", limit: 100 });
    let sent = 0;
    let failed = 0;
    for (const row of page.items) {
      await this.service.dispatch(row);
      const after = await this.repo.findById(row.id);
      if (after?.status === "sent") sent++;
      else failed++;
    }
    return { sent, failed };
  }
}
