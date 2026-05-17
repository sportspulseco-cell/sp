import { Module } from "@nestjs/common";
import { IamModule } from "../iam/iam.module";
import { LeagueManagementModule } from "../league-management/league-management.module";
import { CommunicationsModule } from "../communications/communications.module";
import { FinanceModule } from "../finance/finance.module";
import { RegistrationComplianceModule } from "../registration-compliance/registration-compliance.module";
import { RegistrationV2Module } from "../registration-v2/registration-v2.module";
import { OrgAdminTeamsController } from "./interface/org-admin-teams.controller";
import { OrgAdminRefundAssessmentsController } from "./interface/org-admin-refund-assessments.controller";
import { OrgAdminLeaguesController } from "./interface/org-admin-leagues.controller";
import { OrgAdminSeasonsController } from "./interface/org-admin-seasons.controller";
import { OrgAdminDivisionsController } from "./interface/org-admin-divisions.controller";
import { OrgAdminBroadcastController } from "./interface/org-admin-broadcast.controller";
import { OrgAdminFinanceController } from "./interface/org-admin-finance.controller";
import { OrgAdminRegistrationsController } from "./interface/org-admin-registrations.controller";
import { OrgAdminFormsController } from "./interface/org-admin-forms.controller";
import { OrgAdminFormBuilderController } from "./interface/org-admin-form-builder.controller";

/**
 * Backlog #17 — org-admin extended actions module.
 *
 * Endpoints:
 *   - /org-admin/teams/...               captain grant + revoke
 *   - /org-admin/refund-assessments/...  dispute adjudication
 *   - /org-admin/leagues                 create a league (kick off setup)
 *
 * Each controller carries the scope check inline (caller must hold
 * super_admin or org_admin on the relevant org) so the rest of the
 * API surface keeps its default "writes require super_admin" rule.
 */
@Module({
  imports: [
    IamModule,
    LeagueManagementModule,
    CommunicationsModule,
    FinanceModule,
    RegistrationComplianceModule,
    RegistrationV2Module
  ],
  controllers: [
    OrgAdminTeamsController,
    OrgAdminRefundAssessmentsController,
    OrgAdminLeaguesController,
    OrgAdminSeasonsController,
    OrgAdminDivisionsController,
    OrgAdminBroadcastController,
    OrgAdminFinanceController,
    OrgAdminRegistrationsController,
    OrgAdminFormsController,
    OrgAdminFormBuilderController
  ]
})
export class OrgAdminModule {}
