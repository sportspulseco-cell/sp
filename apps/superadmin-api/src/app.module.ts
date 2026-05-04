import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./shared/auth/auth.module";
import { IamModule } from "./modules/iam/iam.module";
import { OrgManagementModule } from "./modules/org-management/org-management.module";
import { LeagueManagementModule } from "./modules/league-management/league-management.module";
import { RegistrationComplianceModule } from "./modules/registration-compliance/registration-compliance.module";
import { RosterMembershipModule } from "./modules/roster-membership/roster-membership.module";
import { GameOperationsModule } from "./modules/game-operations/game-operations.module";
import { StatsModule } from "./modules/stats/stats.module";
import { CommunicationsModule } from "./modules/communications/communications.module";
import { AuditModule } from "./modules/audit/audit.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { AdminModule } from "./modules/admin/admin.module";
import { DataMigrationModule } from "./modules/data-migration/data-migration.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule.forRoot(),
    DatabaseModule,
    AuthModule,
    IamModule,
    OrgManagementModule,
    LeagueManagementModule,
    RegistrationComplianceModule,
    RosterMembershipModule,
    GameOperationsModule,
    StatsModule,
    CommunicationsModule,
    AuditModule,
    ReportsModule,
    FinanceModule,
    AdminModule,
    DataMigrationModule
  ]
})
export class AppModule {}
