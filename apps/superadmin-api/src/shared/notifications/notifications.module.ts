import { Global, Module } from "@nestjs/common";
import { EmailDispatcherService } from "./email-dispatcher.service";
import { PushDispatcherService } from "./push-dispatcher.service";

/**
 * Global notifications module. Exposes the per-channel dispatchers so
 * any handler can `inject` them without a per-module import. Twilio
 * (SMS) wires in here when that lands.
 */
@Global()
@Module({
  providers: [EmailDispatcherService, PushDispatcherService],
  exports: [EmailDispatcherService, PushDispatcherService]
})
export class NotificationsModule {}
