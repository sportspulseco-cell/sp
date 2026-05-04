import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  AdminRepository,
  FeatureFlagRow,
  SportRow,
  SystemSettingRow,
  UpdateSportInput,
  UpsertFeatureFlagInput,
  UpsertSystemSettingInput
} from "../../domain/repositories/admin.repository";

@Injectable()
export class DrizzleAdminRepository implements AdminRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- System settings ----------

  async listSettings(category?: string): Promise<SystemSettingRow[]> {
    const rows = await this.db
      .select()
      .from(schema.systemSettings)
      .where(category ? eq(schema.systemSettings.category, category) : undefined)
      .orderBy(asc(schema.systemSettings.category), asc(schema.systemSettings.key));
    return rows.map((r) => this.toSetting(r));
  }

  async getSetting(key: string): Promise<SystemSettingRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, key));
    return row ? this.toSetting(row) : null;
  }

  async upsertSetting(
    input: UpsertSystemSettingInput
  ): Promise<SystemSettingRow> {
    await this.db
      .insert(schema.systemSettings)
      .values({
        key: input.key,
        category: input.category ?? "general",
        value: input.value as never,
        description: input.description ?? null,
        isEditable: input.isEditable ?? true,
        updatedByUserId: input.updatedByUserId ?? null
      })
      .onConflictDoUpdate({
        target: schema.systemSettings.key,
        set: {
          value: input.value as never,
          category: input.category ?? "general",
          description: input.description ?? null,
          isEditable: input.isEditable ?? true,
          updatedByUserId: input.updatedByUserId ?? null,
          updatedAt: sql`NOW()`
        }
      });
    const found = await this.getSetting(input.key);
    if (!found) throw new Error("system_setting upsert failed");
    return found;
  }

  // ---------- Feature flags ----------

  async listFlags(): Promise<FeatureFlagRow[]> {
    const rows = await this.db
      .select()
      .from(schema.featureFlags)
      .orderBy(asc(schema.featureFlags.key));
    return rows.map((r) => this.toFlag(r));
  }

  async getFlag(key: string): Promise<FeatureFlagRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.featureFlags)
      .where(eq(schema.featureFlags.key, key));
    return row ? this.toFlag(row) : null;
  }

  async upsertFlag(input: UpsertFeatureFlagInput): Promise<FeatureFlagRow> {
    await this.db
      .insert(schema.featureFlags)
      .values({
        key: input.key,
        description: input.description ?? null,
        isEnabled: input.isEnabled ?? false,
        rolloutPct: String(input.rolloutPct ?? 0),
        orgAllowlist: input.orgAllowlist ?? [],
        variants: input.variants ?? [],
        updatedByUserId: input.updatedByUserId ?? null
      })
      .onConflictDoUpdate({
        target: schema.featureFlags.key,
        set: {
          description: input.description ?? null,
          isEnabled: input.isEnabled ?? false,
          rolloutPct: String(input.rolloutPct ?? 0),
          orgAllowlist: input.orgAllowlist ?? [],
          variants: input.variants ?? [],
          updatedByUserId: input.updatedByUserId ?? null,
          updatedAt: sql`NOW()`
        }
      });
    const found = await this.getFlag(input.key);
    if (!found) throw new Error("feature_flag upsert failed");
    return found;
  }

  async deleteFlag(key: string): Promise<void> {
    await this.db
      .delete(schema.featureFlags)
      .where(eq(schema.featureFlags.key, key));
  }

  // ---------- Sports ----------

  async listSports(): Promise<SportRow[]> {
    const rows = await this.db
      .select()
      .from(schema.sports)
      .orderBy(asc(schema.sports.code));
    return rows.map((r) => this.toSport(r));
  }

  async updateSport(input: UpdateSportInput): Promise<SportRow> {
    const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (input.active !== undefined) updates.active = input.active;
    if (input.teamSizeDefault !== undefined)
      updates.teamSizeDefault = input.teamSizeDefault;
    if (input.scoringModel) updates.scoringModel = input.scoringModel;

    await this.db
      .update(schema.sports)
      .set(updates as never)
      .where(eq(schema.sports.code, input.code));

    const [row] = await this.db
      .select()
      .from(schema.sports)
      .where(eq(schema.sports.code, input.code));
    if (!row) throw new Error("sport not found");
    return this.toSport(row);
  }

  // ---------- Mappers ----------

  private toSetting(
    r: typeof schema.systemSettings.$inferSelect
  ): SystemSettingRow {
    return {
      id: r.id,
      key: r.key,
      category: r.category,
      value: r.value,
      description: r.description,
      isEditable: r.isEditable,
      updatedByUserId: r.updatedByUserId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  private toFlag(r: typeof schema.featureFlags.$inferSelect): FeatureFlagRow {
    return {
      id: r.id,
      key: r.key,
      description: r.description,
      isEnabled: r.isEnabled,
      rolloutPct: parseFloat(r.rolloutPct),
      orgAllowlist: (r.orgAllowlist ?? []) as string[],
      variants: (r.variants ?? []) as FeatureFlagRow["variants"],
      updatedByUserId: r.updatedByUserId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  private toSport(r: typeof schema.sports.$inferSelect): SportRow {
    return {
      code: r.code,
      name: r.name,
      teamSizeDefault: r.teamSizeDefault,
      periodModel: r.periodModel,
      scoringModel: (r.scoringModel ?? {}) as Record<string, unknown>,
      active: r.active,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
}
