import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { RegistrationV2Service } from "./application/registration-v2.service";
import { PricingTiersController } from "./interface/pricing-tiers.controller";
import { PricingTierDivisionsController } from "./interface/pricing-tier-divisions.controller";
import { EmailTemplatesController } from "./interface/email-templates.controller";
import { TeamInvitesController } from "./interface/team-invites.controller";
import { PublicInvitesController } from "./interface/public-invites.controller";
import { PublicRegistrationController } from "./interface/public-registration.controller";
import { FreeAgentPoolController } from "./interface/free-agent-pool.controller";
import { SeasonRolloverController } from "./interface/season-rollover.controller";
import { AdminReviewController } from "./interface/admin-review.controller";

@Module({
  // NotificationService: personal team invites queue the TEAM_INVITE_NEW
  // email (before this the /captain/invites "Invite sent" sent nothing, CAP-4).
  imports: [CommunicationsModule],
  controllers: [
    PricingTiersController,
    PricingTierDivisionsController,
    EmailTemplatesController,
    TeamInvitesController,
    PublicInvitesController,
    PublicRegistrationController,
    FreeAgentPoolController,
    SeasonRolloverController,
    AdminReviewController
  ],
  providers: [RegistrationV2Service],
  exports: [RegistrationV2Service]
})
export class RegistrationV2Module {}
