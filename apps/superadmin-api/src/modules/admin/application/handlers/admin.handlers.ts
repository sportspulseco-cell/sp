import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { NotFoundError } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  ADMIN_REPOSITORY,
  type AdminRepository,
  type UpdateSportInput,
  type UpsertFeatureFlagInput,
  type UpsertSystemSettingInput
} from "../../domain/repositories/admin.repository";
import {
  FeatureFlagDto,
  HealthDto,
  SportDto,
  SystemSettingDto
} from "../dtos/admin.dto";

@Injectable()
export class ListSettingsHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute({
    category
  }: { category?: string } = {}): Promise<SystemSettingDto[]> {
    const rows = await this.repo.listSettings(category);
    return rows.map((r) => SystemSettingDto.fromRow(r));
  }
}

@Injectable()
export class UpsertSettingHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute(input: UpsertSystemSettingInput): Promise<SystemSettingDto> {
    const row = await this.repo.upsertSetting(input);
    return SystemSettingDto.fromRow(row);
  }
}

@Injectable()
export class ListFlagsHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute(): Promise<FeatureFlagDto[]> {
    const rows = await this.repo.listFlags();
    return rows.map((r) => FeatureFlagDto.fromRow(r));
  }
}

@Injectable()
export class UpsertFlagHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute(input: UpsertFeatureFlagInput): Promise<FeatureFlagDto> {
    const row = await this.repo.upsertFlag(input);
    return FeatureFlagDto.fromRow(row);
  }
}

@Injectable()
export class DeleteFlagHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute({ key }: { key: string }) {
    const existing = await this.repo.getFlag(key);
    if (!existing) throw new NotFoundError("FeatureFlag", key);
    await this.repo.deleteFlag(key);
    return { ok: true };
  }
}

@Injectable()
export class ListSportsHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute(): Promise<SportDto[]> {
    const rows = await this.repo.listSports();
    return rows.map((r) => SportDto.fromRow(r));
  }
}

@Injectable()
export class UpdateSportHandler {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repo: AdminRepository
  ) {}
  async execute(input: UpdateSportInput): Promise<SportDto> {
    const row = await this.repo.updateSport(input);
    return SportDto.fromRow(row);
  }
}

@Injectable()
export class HealthHandler {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  async execute(): Promise<HealthDto> {
    const t0 = Date.now();
    let dbOk = false;
    try {
      await this.db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const dbLatencyMs = Date.now() - t0;
    return {
      status: dbOk ? "ok" : "degraded",
      dbOk,
      dbLatencyMs,
      modules: [
        "iam",
        "org-management",
        "league-management",
        "registration-compliance",
        "roster-membership",
        "game-operations",
        "stats",
        "communications",
        "audit",
        "reports",
        "finance",
        "admin"
      ],
      timestamp: new Date().toISOString()
    };
  }
}
