import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";

import { GamesController } from "./interface/games.controller";
import { EventsController } from "./interface/events.controller";
import { SuspensionsController } from "./interface/suspensions.controller";
import { GameOfficialsController } from "./interface/game-officials.controller";

import {
  ListGamesHandler,
  GetGameHandler,
  CreateGameHandler,
  StartPlayHandler,
  ApplyScoreHandler,
  PostponeGameHandler,
  CancelGameHandler,
  ForfeitGameHandler,
  FinalizeGameHandler
} from "./application/games/handlers";
import {
  AppendEventHandler,
  ListEventsHandler,
  ListGameEventsHandler
} from "./application/events/handlers";
import {
  ListSuspensionsHandler,
  IssueSuspensionHandler,
  LiftSuspensionHandler,
  ServeSuspensionHandler
} from "./application/suspensions/handlers";
import {
  AssignGameOfficialHandler,
  ListGameOfficialsHandler,
  ListPersonOfficialAssignmentsHandler,
  RevokeGameOfficialHandler,
  UpdateOfficialStatusHandler
} from "./application/officials/handlers";

import { GAME_REPOSITORY } from "./domain/repositories/game.repository";
import { GAME_EVENT_REPOSITORY } from "./domain/repositories/game-event.repository";
import { SUSPENSION_REPOSITORY } from "./domain/repositories/suspension.repository";
import { GAME_OFFICIAL_REPOSITORY } from "./domain/repositories/game-official.repository";

import { DrizzleGameRepository } from "./infrastructure/repositories/drizzle-game.repository";
import { DrizzleGameEventRepository } from "./infrastructure/repositories/drizzle-game-event.repository";
import { DrizzleSuspensionRepository } from "./infrastructure/repositories/drizzle-suspension.repository";
import { DrizzleGameOfficialRepository } from "./infrastructure/repositories/drizzle-game-official.repository";

@Module({
  imports: [CommunicationsModule],
  controllers: [
    GamesController,
    EventsController,
    SuspensionsController,
    GameOfficialsController
  ],
  providers: [
    // Games
    ListGamesHandler,
    GetGameHandler,
    CreateGameHandler,
    StartPlayHandler,
    ApplyScoreHandler,
    PostponeGameHandler,
    CancelGameHandler,
    ForfeitGameHandler,
    FinalizeGameHandler,
    // Events
    AppendEventHandler,
    ListEventsHandler,
    ListGameEventsHandler,
    // Suspensions
    ListSuspensionsHandler,
    IssueSuspensionHandler,
    LiftSuspensionHandler,
    ServeSuspensionHandler,
    // Officials
    ListGameOfficialsHandler,
    ListPersonOfficialAssignmentsHandler,
    AssignGameOfficialHandler,
    UpdateOfficialStatusHandler,
    RevokeGameOfficialHandler,

    { provide: GAME_REPOSITORY, useClass: DrizzleGameRepository },
    { provide: GAME_EVENT_REPOSITORY, useClass: DrizzleGameEventRepository },
    { provide: SUSPENSION_REPOSITORY, useClass: DrizzleSuspensionRepository },
    {
      provide: GAME_OFFICIAL_REPOSITORY,
      useClass: DrizzleGameOfficialRepository
    }
  ]
})
export class GameOperationsModule {}
