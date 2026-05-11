import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { CaptainApplicationsController } from "./interface/captain-applications.controller";
import { AdminApplicationsController } from "./interface/admin-applications.controller";

/**
 * Approval-gate flow — captain applies → admin reviews → approved
 * entries unlock the Workflow 7A rollover wizard.
 */
@Module({
  imports: [CommunicationsModule],
  controllers: [CaptainApplicationsController, AdminApplicationsController]
})
export class TeamApplicationsModule {}
