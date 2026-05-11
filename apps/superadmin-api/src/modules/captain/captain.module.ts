import { Module } from "@nestjs/common";
import { CaptainController } from "./interface/captain.controller";

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
  controllers: [CaptainController]
})
export class CaptainModule {}
