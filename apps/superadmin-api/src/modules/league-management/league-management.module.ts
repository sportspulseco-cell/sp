import { Module } from "@nestjs/common";

// Interface
import { SeasonsController } from "./interface/seasons.controller";
import { LeaguesController } from "./interface/leagues.controller";
import { DivisionsController } from "./interface/divisions.controller";
import { TeamsController } from "./interface/teams.controller";
import { TeamSummaryController } from "./interface/team-summary.controller";
import { LeagueReferenceController } from "./interface/reference.controller";

// Application — handlers
import {
  ListSeasonsHandler,
  GetSeasonHandler,
  CreateSeasonHandler,
  UpdateSeasonHandler,
  ChangeSeasonStatusHandler,
  ArchiveSeasonHandler
} from "./application/seasons/handlers";
import {
  ListLeaguesHandler,
  GetLeagueHandler,
  CreateLeagueHandler,
  UpdateLeagueHandler,
  ChangeLeagueStatusHandler
} from "./application/leagues/handlers";
import {
  ListDivisionsHandler,
  GetDivisionHandler,
  CreateDivisionHandler,
  UpdateDivisionHandler,
  ArchiveDivisionHandler
} from "./application/divisions/handlers";
import {
  ListTeamsHandler,
  GetTeamHandler,
  CreateTeamHandler,
  UpdateTeamHandler,
  DissolveTeamHandler
} from "./application/teams/handlers";

// Domain ports
import { SEASON_REPOSITORY } from "./domain/repositories/season.repository";
import { LEAGUE_REPOSITORY } from "./domain/repositories/league.repository";
import { DIVISION_REPOSITORY } from "./domain/repositories/division.repository";
import { TEAM_REPOSITORY } from "./domain/repositories/team.repository";

// Infrastructure adapters
import { DrizzleSeasonRepository } from "./infrastructure/repositories/drizzle-season.repository";
import { DrizzleLeagueRepository } from "./infrastructure/repositories/drizzle-league.repository";
import { DrizzleDivisionRepository } from "./infrastructure/repositories/drizzle-division.repository";
import { DrizzleTeamRepository } from "./infrastructure/repositories/drizzle-team.repository";

@Module({
  controllers: [
    SeasonsController,
    LeaguesController,
    DivisionsController,
    TeamsController,
    TeamSummaryController,
    LeagueReferenceController
  ],
  providers: [
    // Application
    ListSeasonsHandler,
    GetSeasonHandler,
    CreateSeasonHandler,
    UpdateSeasonHandler,
    ChangeSeasonStatusHandler,
    ArchiveSeasonHandler,
    ListLeaguesHandler,
    GetLeagueHandler,
    CreateLeagueHandler,
    UpdateLeagueHandler,
    ChangeLeagueStatusHandler,
    ListDivisionsHandler,
    GetDivisionHandler,
    CreateDivisionHandler,
    UpdateDivisionHandler,
    ArchiveDivisionHandler,
    ListTeamsHandler,
    GetTeamHandler,
    CreateTeamHandler,
    UpdateTeamHandler,
    DissolveTeamHandler,

    // Domain ports → infra impls (DIP)
    { provide: SEASON_REPOSITORY, useClass: DrizzleSeasonRepository },
    { provide: LEAGUE_REPOSITORY, useClass: DrizzleLeagueRepository },
    { provide: DIVISION_REPOSITORY, useClass: DrizzleDivisionRepository },
    { provide: TEAM_REPOSITORY, useClass: DrizzleTeamRepository }
  ],
  exports: [
    TEAM_REPOSITORY,
    LEAGUE_REPOSITORY,
    DIVISION_REPOSITORY,
    SEASON_REPOSITORY,
    CreateLeagueHandler,
    CreateSeasonHandler,
    CreateDivisionHandler,
    CreateTeamHandler
  ]
})
export class LeagueManagementModule {}
