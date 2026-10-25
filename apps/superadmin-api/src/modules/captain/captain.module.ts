import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { RegistrationV2Module } from "../registration-v2/registration-v2.module";
import { CaptainController } from "./interface/captain.controller";
import { CaptainRosterController } from "./interface/captain-roster.controller";
import { ComplianceController } from "./interface/compliance.controller";
import { TeamJoinRequestsController } from "./interface/team-join-requests.controller";

/**
 * Workflow 7A Phase 2 · captain console endpoints.
 *
 * Public surface mounted at /captain/* — used by team-admin-web's
 * rollover wizard and by player-web when a player follows an invite.
 *
 * Endpoints in this module are JwtAuthGuard'd and scope-check the
 * caller's role against `teams.captain_user_id`. Super-admins pass
 * through the same paths so they can preview the captain UI.
 */
@Module({
  // RegistrationV2Module: FreeAgentOffersService settles free-agent offers
  // when the player accepts or declines (CAP-9).
  imports: [CommunicationsModule, RegistrationV2Module],
  controllers: [
    CaptainController,
    CaptainRosterController,
    ComplianceController,
    TeamJoinRequestsController
  ]
})
export class CaptainModule {}
