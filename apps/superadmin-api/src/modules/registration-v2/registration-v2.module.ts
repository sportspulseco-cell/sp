import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { FinanceModule } from "../finance/finance.module";
import { RegistrationV2Service } from "./application/registration-v2.service";
import { RegistrationRequirementsService } from "./application/registration-requirements.service";
import { FreeAgentOffersService } from "./application/free-agent-offers.service";
import { PricingTiersController } from "./interface/pricing-tiers.controller";
import { PricingTierDivisionsController } from "./interface/pricing-tier-divisions.controller";
import { EmailTemplatesController } from "./interface/email-templates.controller";
import { TeamInvitesController } from "./interface/team-invites.controller";
import { PublicInvitesController } from "./interface/public-invites.controller";
import { PublicRegistrationController } from "./interface/public-registration.controller";
import { FreeAgentPoolController } from "./interface/free-agent-pool.controller";
import { FreeAgentPoolAdminController } from "./interface/free-agent-pool-admin.controller";
import { SeasonRolloverController } from "./interface/season-rollover.controller";
import { AdminReviewController } from "./interface/admin-review.controller";

@Module({
  // NotificationService: personal team invites queue the TEAM_INVITE_NEW
  // email (before this the /captain/invites "Invite sent" sent nothing, CAP-4).
  // FinanceModule: the PaymentProcessor seam that charges registration fees.
  imports: [CommunicationsModule, FinanceModule],
  controllers: [
    PricingTiersController,
    PricingTierDivisionsController,
    EmailTemplatesController,
    TeamInvitesController,
    PublicInvitesController,
    PublicRegistrationController,
    FreeAgentPoolController,
    FreeAgentPoolAdminController,
    SeasonRolloverController,
    AdminReviewController
  ],
  // RegistrationRequirementsService: form binding, registration window and
  // required-document signatures, shared with the player /compliance page.
  // FreeAgentOffersService: free-agent offers (CAP-9); exported for the
  // captain module, whose invite accept / decline settles them.
  providers: [RegistrationV2Service, RegistrationRequirementsService, FreeAgentOffersService],
  exports: [RegistrationV2Service, RegistrationRequirementsService, FreeAgentOffersService]
})
export class RegistrationV2Module {}
