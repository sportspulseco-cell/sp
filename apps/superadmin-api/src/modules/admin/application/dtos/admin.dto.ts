import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  FeatureFlagRow,
  SportRow,
  SystemSettingRow
} from "../../domain/repositories/admin.repository";

export class SystemSettingDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() category!: string;
  @ApiProperty() value!: unknown;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() isEditable!: boolean;
  @ApiPropertyOptional({ nullable: true }) updatedByUserId!: string | null;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: SystemSettingRow): SystemSettingDto {
    return {
      id: r.id,
      key: r.key,
      category: r.category,
      value: r.value,
      description: r.description,
      isEditable: r.isEditable,
      updatedByUserId: r.updatedByUserId,
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class FeatureFlagDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() rolloutPct!: number;
  @ApiProperty({ type: [String] }) orgAllowlist!: string[];
  @ApiProperty() variants!: FeatureFlagRow["variants"];
  @ApiProperty() updatedAt!: string;

  static fromRow(r: FeatureFlagRow): FeatureFlagDto {
    return {
      id: r.id,
      key: r.key,
      description: r.description,
      isEnabled: r.isEnabled,
      rolloutPct: r.rolloutPct,
      orgAllowlist: r.orgAllowlist,
      variants: r.variants,
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class SportDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) teamSizeDefault!: number | null;
  @ApiProperty() periodModel!: string;
  @ApiProperty() scoringModel!: Record<string, unknown>;
  @ApiProperty() active!: boolean;

  static fromRow(r: SportRow): SportDto {
    return {
      code: r.code,
      name: r.name,
      teamSizeDefault: r.teamSizeDefault,
      periodModel: r.periodModel,
      scoringModel: r.scoringModel,
      active: r.active
    };
  }
}

export class HealthDto {
  @ApiProperty() status!: "ok" | "degraded";
  @ApiProperty() dbOk!: boolean;
  @ApiProperty() dbLatencyMs!: number;
  @ApiProperty({ type: [String] }) modules!: string[];
  @ApiProperty() timestamp!: string;
}
