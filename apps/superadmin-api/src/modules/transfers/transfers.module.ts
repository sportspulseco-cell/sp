import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { TransfersController } from "./interface/transfers.controller";
import { AdminTransfersController } from "./interface/admin-transfers.controller";
import { DivisionEntriesAdminController } from "./interface/division-entries-admin.controller";
import { NoShowReportController } from "./interface/no-show-report.controller";

/**
 * Workflow 7B · Sprint 6 — transfers, division-rejection, no-show report.
 *
 * Three-actor transfer flow:
 *   - source captain → POST /league/teams/:id/transfer
 *   - destination captain → POST /league/teams/transfer/:id/accept
 *   - super admin → POST /league/teams/transfer/:id/approve | /reject
 *
 * Plus admin-only:
 *   - POST /league/division-team-entries/:id/reject (Case 9)
 *   - GET  /league/reports/no-show (Case 10)
 */
@Module({
  imports: [CommunicationsModule],
  controllers: [
    TransfersController,
    AdminTransfersController,
    DivisionEntriesAdminController,
    NoShowReportController
  ]
})
export class TransfersModule {}
