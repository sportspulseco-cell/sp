import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { waitUntil } from "@vercel/functions";
import { NotificationService } from "../application/notification.service";
import { notificationWork } from "../application/notification-work";

@Injectable()
export class NotificationDeliveryInterceptor implements NestInterceptor {
  constructor(private readonly notifications: NotificationService) {}
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return new Observable(subscriber => notificationWork.run(new Set<string>(), () => {
      const work = notificationWork.getStore()!;
      return next.handle().subscribe({
        next: value => {
          if (work.size) { waitUntil(this.notifications.deliverCommitted([...work])); work.clear(); }
          subscriber.next(value);
        },
        error: error => { work.clear(); subscriber.error(error); },
        complete: () => subscriber.complete(),
      });
    }));
  }
}
