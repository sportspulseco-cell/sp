import { Module } from "@nestjs/common";
import { IamModule } from "../iam/iam.module";
import { OrgAdminTeamsController } from "./interface/org-admin-teams.controller";

/**
 * Backlog #17 — org-admin extended actions module.
 *
 * Today this exposes captain assignment (grant + revoke) at
 * `/org-admin/teams/...`. Future endpoints (kick off org-setup,
 * dispute resolution) will live in the same module so the org-admin
 * mutation surface stays in one place.
 */
@Module({
  imports: [IamModule],
  controllers: [OrgAdminTeamsController]
})
export class OrgAdminModule {}
