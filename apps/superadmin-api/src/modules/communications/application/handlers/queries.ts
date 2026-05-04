import { Inject, Injectable } from "@nestjs/common";
import {
  NOTIFICATION_REPOSITORY,
  type ListNotificationsQuery,
  type NotificationRepository
} from "../../domain/repositories/notification.repository";
import {
  NotificationDto,
  NotificationPageDto
} from "../dtos/notification.dto";

@Injectable()
export class ListNotificationsHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository
  ) {}

  async execute(q: Partial<ListNotificationsQuery> = {}): Promise<NotificationPageDto> {
    const page = await this.repo.list({ ...q, limit: q.limit ?? 50 });
    return {
      items: page.items.map((r) => NotificationDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetNotificationHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository
  ) {}

  async execute({ id }: { id: string }): Promise<NotificationDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new Error("notification not found");
    return NotificationDto.fromRow(row);
  }
}

@Injectable()
export class RecentForPersonHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository
  ) {}

  async execute({ personId }: { personId: string }): Promise<NotificationDto[]> {
    const rows = await this.repo.recentForPerson(personId, 25);
    return rows.map((r) => NotificationDto.fromRow(r));
  }
}
