import { Module } from "@nestjs/common";
import { AdminController } from "./interface/admin.controller";
import { MaterializedViewsController } from "./interface/materialized-views.controller";
import { CronSecretGuard } from "../../shared/auth/guards/cron-secret.guard";
import {
  DeleteFlagHandler,
  HealthHandler,
  ListFlagsHandler,
  ListSettingsHandler,
  ListSportsHandler,
  UpdateSportHandler,
  UpsertFlagHandler,
  UpsertSettingHandler
} from "./application/handlers/admin.handlers";
import { ADMIN_REPOSITORY } from "./domain/repositories/admin.repository";
import { DrizzleAdminRepository } from "./infrastructure/repositories/drizzle-admin.repository";

@Module({
  controllers: [AdminController, MaterializedViewsController],
  providers: [
    CronSecretGuard,
    ListSettingsHandler,
    UpsertSettingHandler,
    ListFlagsHandler,
    UpsertFlagHandler,
    DeleteFlagHandler,
    ListSportsHandler,
    UpdateSportHandler,
    HealthHandler,
    { provide: ADMIN_REPOSITORY, useClass: DrizzleAdminRepository }
  ]
})
export class AdminModule {}
