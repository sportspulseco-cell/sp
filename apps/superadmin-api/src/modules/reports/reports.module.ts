import { Module } from "@nestjs/common";
import { ReportsController } from "./interface/reports.controller";
import { ReportsService } from "./application/reports.service";
import { STATS_REPOSITORY } from "../stats/domain/repositories/stats.repository";
import { DrizzleStatsRepository } from "../stats/infrastructure/repositories/drizzle-stats.repository";
import { TEAM_MEMBERSHIP_REPOSITORY } from "../roster-membership/domain/repositories/team-membership.repository";
import { DrizzleTeamMembershipRepository } from "../roster-membership/infrastructure/repositories/drizzle-team-membership.repository";
import { REGISTRATION_REPOSITORY } from "../registration-compliance/domain/repositories/registration.repository";
import { DrizzleRegistrationRepository } from "../registration-compliance/infrastructure/repositories/drizzle-registration.repository";

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: STATS_REPOSITORY, useClass: DrizzleStatsRepository },
    {
      provide: TEAM_MEMBERSHIP_REPOSITORY,
      useClass: DrizzleTeamMembershipRepository
    },
    { provide: REGISTRATION_REPOSITORY, useClass: DrizzleRegistrationRepository }
  ]
})
export class ReportsModule {}
