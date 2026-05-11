import { Module } from "@nestjs/common";
import { StatsController } from "./interface/stats.controller";
import { ProjectStatsHandler } from "./application/handlers/project-stats.handler";
import { RecomputeStandingsHandler } from "./application/handlers/recompute-standings.handler";
import {
  BuildLeaderboardHandler,
  ListLinesForGameHandler,
  ListStandingsHandler,
  ListStatLinesHandler,
  TeamStandingHandler
} from "./application/handlers/queries";
import { STATS_REPOSITORY } from "./domain/repositories/stats.repository";
import { DrizzleStatsRepository } from "./infrastructure/repositories/drizzle-stats.repository";

@Module({
  controllers: [StatsController],
  providers: [
    ProjectStatsHandler,
    RecomputeStandingsHandler,
    BuildLeaderboardHandler,
    ListStatLinesHandler,
    ListLinesForGameHandler,
    ListStandingsHandler,
    TeamStandingHandler,
    { provide: STATS_REPOSITORY, useClass: DrizzleStatsRepository }
  ]
})
export class StatsModule {}
