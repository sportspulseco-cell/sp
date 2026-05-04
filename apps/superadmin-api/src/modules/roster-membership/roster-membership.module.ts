import { Module } from "@nestjs/common";
import { LeagueManagementModule } from "../league-management/league-management.module";
import { RosterMovesController } from "./interface/roster-moves.controller";
import { RostersController } from "./interface/rosters.controller";

import {
  ListRosterMovesHandler,
  GetRosterMoveHandler,
  AddPlayerHandler,
  DropPlayerHandler,
  TradePlayerHandler,
  CallUpPlayerHandler,
  SendDownPlayerHandler
} from "./application/moves/handlers";
import {
  ListMembershipsHandler,
  RosterSnapshotHandler
} from "./application/rosters/handlers";

import { ROSTER_MOVE_REPOSITORY } from "./domain/repositories/roster-move.repository";
import { TEAM_MEMBERSHIP_REPOSITORY } from "./domain/repositories/team-membership.repository";

import { DrizzleRosterMoveRepository } from "./infrastructure/repositories/drizzle-roster-move.repository";
import { DrizzleTeamMembershipRepository } from "./infrastructure/repositories/drizzle-team-membership.repository";

@Module({
  imports: [LeagueManagementModule],
  controllers: [RosterMovesController, RostersController],
  providers: [
    ListRosterMovesHandler,
    GetRosterMoveHandler,
    AddPlayerHandler,
    DropPlayerHandler,
    TradePlayerHandler,
    CallUpPlayerHandler,
    SendDownPlayerHandler,
    ListMembershipsHandler,
    RosterSnapshotHandler,
    {
      provide: ROSTER_MOVE_REPOSITORY,
      useClass: DrizzleRosterMoveRepository
    },
    {
      provide: TEAM_MEMBERSHIP_REPOSITORY,
      useClass: DrizzleTeamMembershipRepository
    }
  ]
})
export class RosterMembershipModule {}
