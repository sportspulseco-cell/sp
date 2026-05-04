import { Injectable, Logger } from "@nestjs/common";
import type { NotificationRow } from "../../domain/repositories/notification.repository";

/**
 * Stub provider — logs the notification body and returns success.
 * Swap for Resend/Postmark/SES by implementing the same interface and
 * binding it to NOTIFICATION_PROVIDER in the module.
 */
@Injectable()
export class ConsoleNotificationProvider {
  private readonly log = new Logger("Notify");

  async send(row: NotificationRow): Promise<void> {
    const head = `[${row.channel.toUpperCase()} → ${row.recipientEmail ?? row.recipientPersonId ?? "?"}]`;
    this.log.log(`${head} ${row.subject ?? "(no subject)"}`);
    this.log.verbose(`${head} body:\n${row.body}`);
    return Promise.resolve();
  }
}
