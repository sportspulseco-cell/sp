import { Global, Module } from "@nestjs/common";
import { EmailDispatcherService } from "./email-dispatcher.service";

/**
 * Global notifications module. Exposes EmailDispatcherService so
 * any handler can `inject` it without a per-module import. Twilio +
 * Firebase push wire in here when those land.
 */
@Global()
@Module({
  providers: [EmailDispatcherService],
  exports: [EmailDispatcherService]
})
export class NotificationsModule {}
