import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./shared/auth/auth.module";
import { NotificationsModule } from "./shared/notifications/notifications.module";
import { IamModule } from "./modules/iam/iam.module";
import { OrgManagementModule } from "./modules/org-management/org-management.module";
import { LeagueManagementModule } from "./modules/league-management/league-management.module";
import { RegistrationComplianceModule } from "./modules/registration-compliance/registration-compliance.module";
import { RegistrationV2Module } from "./modules/registration-v2/registration-v2.module";
import { RosterMembershipModule } from "./modules/roster-membership/roster-membership.module";
import { GameOperationsModule } from "./modules/game-operations/game-operations.module";
import { StatsModule } from "./modules/stats/stats.module";
import { CommunicationsModule } from "./modules/communications/communications.module";
import { AuditModule } from "./modules/audit/audit.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { AdminModule } from "./modules/admin/admin.module";
import { DataMigrationModule } from "./modules/data-migration/data-migration.module";
import { CaptainModule } from "./modules/captain/captain.module";
import { TransfersModule } from "./modules/transfers/transfers.module";
import { TeamApplicationsModule } from "./modules/team-applications/team-applications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule.forRoot(),
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    IamModule,
    OrgManagementModule,
    LeagueManagementModule,
    RegistrationComplianceModule,
    RegistrationV2Module,
    RosterMembershipModule,
    GameOperationsModule,
    StatsModule,
    CommunicationsModule,
    AuditModule,
    ReportsModule,
    FinanceModule,
    AdminModule,
    DataMigrationModule,
    CaptainModule,
    TransfersModule,
    TeamApplicationsModule
  ]
})
export class AppModule {}
