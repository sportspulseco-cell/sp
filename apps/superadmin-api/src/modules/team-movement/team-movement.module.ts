import { Module } from "@nestjs/common";
import { StatsModule } from "../stats/stats.module";
import { TeamMovementService } from "./application/team-movement.service";
import { TeamMovementController } from "./interface/team-movement.controller";

/**
 * Team movement across seasons, divisions, leagues and organisations
 * (PPHL item 8). Isolated on purpose: it only reads existing tables and
 * writes division_team_entries + team_movements, and borrows the stats
 * module's standings recompute. No other module depends on it.
 */
@Module({
  imports: [StatsModule],
  controllers: [TeamMovementController],
  providers: [TeamMovementService],
  exports: [TeamMovementService]
})
export class TeamMovementModule {}
