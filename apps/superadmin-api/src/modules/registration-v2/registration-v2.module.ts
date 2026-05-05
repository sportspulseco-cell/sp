import { Module } from "@nestjs/common";
import { RegistrationV2Service } from "./application/registration-v2.service";
import { PricingTiersController } from "./interface/pricing-tiers.controller";
import { EmailTemplatesController } from "./interface/email-templates.controller";
import { TeamInvitesController } from "./interface/team-invites.controller";
import { PublicInvitesController } from "./interface/public-invites.controller";
import { PublicRegistrationController } from "./interface/public-registration.controller";
import { FreeAgentPoolController } from "./interface/free-agent-pool.controller";
import { SeasonRolloverController } from "./interface/season-rollover.controller";

@Module({
  controllers: [
    PricingTiersController,
    EmailTemplatesController,
    TeamInvitesController,
    PublicInvitesController,
    PublicRegistrationController,
    FreeAgentPoolController,
    SeasonRolloverController
  ],
  providers: [RegistrationV2Service],
  exports: [RegistrationV2Service]
})
export class RegistrationV2Module {}
