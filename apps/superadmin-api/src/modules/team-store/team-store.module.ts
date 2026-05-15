import { Module } from "@nestjs/common";
import { TeamStoreCaptainController } from "./interface/team-store-captain.controller";
import { TeamStorePlayerController } from "./interface/team-store-player.controller";

/**
 * Backlog #11 — team merch catalog module.
 *
 * Captain mutations live under `/captain/store/...` and require team
 * captaincy (super_admin bypass). Player browse lives under
 * `/team-store/...` and is restricted to team members.
 *
 * Purchase / checkout flow is deferred until real Stripe (P4-1).
 */
@Module({
  controllers: [TeamStoreCaptainController, TeamStorePlayerController]
})
export class TeamStoreModule {}
