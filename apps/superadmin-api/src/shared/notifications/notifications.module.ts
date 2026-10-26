import { Global, Module } from "@nestjs/common";
import { EmailDispatcherService } from "./email-dispatcher.service";
import { PushDispatcherService } from "./push-dispatcher.service";
import { SmsDispatcherService } from "./sms-dispatcher.service";

/**
 * Global notifications module. Exposes the per-channel dispatchers
 * (email: Resend, SMS: Twilio, push: web push with VAPID) so any
 * handler can inject them without a per-module import.
 */
@Global()
@Module({
  providers: [EmailDispatcherService, PushDispatcherService, SmsDispatcherService],
  exports: [EmailDispatcherService, PushDispatcherService, SmsDispatcherService]
})
export class NotificationsModule {}
