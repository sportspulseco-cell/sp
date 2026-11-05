import { BadRequestException, Controller, Headers, HttpCode, Inject, Post, Req, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { Resend } from "resend";
import { DeliveryReceiptsService, deliveryReceipt } from "../application/delivery-receipts";

@Controller("notifications/webhooks")
export class DeliveryWebhookController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService, private readonly receipts: DeliveryReceiptsService) {}
  @Post("resend") @HttpCode(200)
  async receive(@Req() request: Request & { rawBody?: Buffer }, @Headers("svix-id") id: string,
    @Headers("svix-timestamp") timestamp: string, @Headers("svix-signature") signature: string) {
    const secret = this.config.get<string>("RESEND_WEBHOOK_SECRET");
    if (!secret) throw new ServiceUnavailableException("Email delivery callbacks are not configured");
    if (!request.rawBody || !id || id.length > 255 || !timestamp || !signature) throw new BadRequestException("Missing signed delivery event");
    let receipt;
    try {
      const verified = new Resend("webhook-verification-only").webhooks.verify({ payload: request.rawBody.toString("utf8"),
        headers: { id, timestamp, signature }, webhookSecret: secret });
      const environment = this.config.get<string>("NOTIFICATION_ENVIRONMENT") ?? (this.config.get<string>("NODE_ENV") === "production" ? "production" : "development");
      receipt = deliveryReceipt(verified, environment);
    } catch { throw new BadRequestException("Invalid signed delivery event"); }
    return receipt ? this.receipts.record(id, receipt) : { ignored: true };
  }
}
