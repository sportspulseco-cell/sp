import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { StoreOrdersService } from "./application/store-orders.service";
import { TeamStoreCaptainController } from "./interface/team-store-captain.controller";
import { TeamStorePlayerController } from "./interface/team-store-player.controller";

/**
 * Team store (UC-25, UC-26). Captains curate or generate the catalog
 * and fulfil orders under `/captain/store/...`; players on the roster
 * browse and order under `/team-store/...`. An order's money is its
 * invoice, paid on the player's Payments page (mock card for now).
 */
@Module({
  imports: [CommunicationsModule],
  controllers: [TeamStoreCaptainController, TeamStorePlayerController],
  providers: [StoreOrdersService]
})
export class TeamStoreModule {}
