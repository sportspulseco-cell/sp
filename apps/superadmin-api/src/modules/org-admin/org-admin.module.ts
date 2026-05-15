import { Module } from "@nestjs/common";
import { IamModule } from "../iam/iam.module";
import { OrgAdminTeamsController } from "./interface/org-admin-teams.controller";
import { OrgAdminRefundAssessmentsController } from "./interface/org-admin-refund-assessments.controller";

/**
 * Backlog #17 — org-admin extended actions module.
 *
 * Today this exposes captain assignment (grant + revoke) at
 * `/org-admin/teams/...` and refund-assessment review at
 * `/org-admin/refund-assessments/...`. Future endpoints (kick off
 * org-setup) will land here too so the org-admin mutation surface
 * stays in one place.
 */
@Module({
  imports: [IamModule],
  controllers: [
    OrgAdminTeamsController,
    OrgAdminRefundAssessmentsController
  ]
})
export class OrgAdminModule {}
