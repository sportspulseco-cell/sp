export interface SystemSettingRow {
  id: string;
  key: string;
  category: string;
  value: unknown;
  description: string | null;
  isEditable: boolean;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagRow {
  id: string;
  key: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPct: number;
  orgAllowlist: string[];
  variants: Array<{ name: string; weight?: number; payload?: unknown }>;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SportRow {
  code: string;
  name: string;
  teamSizeDefault: number | null;
  periodModel: string;
  scoringModel: Record<string, unknown>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSystemSettingInput {
  key: string;
  category?: string;
  value: unknown;
  description?: string | null;
  isEditable?: boolean;
  updatedByUserId?: string | null;
}

export interface UpsertFeatureFlagInput {
  key: string;
  description?: string | null;
  isEnabled?: boolean;
  rolloutPct?: number;
  orgAllowlist?: string[];
  variants?: Array<{ name: string; weight?: number; payload?: unknown }>;
  updatedByUserId?: string | null;
}

export interface UpdateSportInput {
  code: string;
  active?: boolean;
  teamSizeDefault?: number | null;
  scoringModel?: Record<string, unknown>;
}

export interface AdminRepository {
  // System settings
  listSettings(category?: string): Promise<SystemSettingRow[]>;
  getSetting(key: string): Promise<SystemSettingRow | null>;
  upsertSetting(input: UpsertSystemSettingInput): Promise<SystemSettingRow>;

  // Feature flags
  listFlags(): Promise<FeatureFlagRow[]>;
  getFlag(key: string): Promise<FeatureFlagRow | null>;
  upsertFlag(input: UpsertFeatureFlagInput): Promise<FeatureFlagRow>;
  deleteFlag(key: string): Promise<void>;

  // Sports
  listSports(): Promise<SportRow[]>;
  updateSport(input: UpdateSportInput): Promise<SportRow>;
}

export const ADMIN_REPOSITORY = Symbol("ADMIN_REPOSITORY");
