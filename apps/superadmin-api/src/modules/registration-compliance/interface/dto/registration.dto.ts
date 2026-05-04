import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

// ---------- Forms ----------

export class CreateFormBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty({ enum: ["org", "league", "division"] })
  @IsIn(["org", "league", "division"])
  scope!: "org" | "league" | "division";
  @ApiPropertyOptional() @IsOptional() @IsUUID() scopeId?: string | null;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
}

export class UpdateFormBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
}

export class CreateFormVersionBodyDto {
  @ApiProperty() @IsObject() schema!: Record<string, unknown>;
}

export class ListFormsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() scopeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

// ---------- Registrations ----------

export class RegistrationItemDto {
  @ApiProperty() @IsString() fieldKey!: string;
  @ApiProperty() @Allow() value!: unknown;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() encrypted?: boolean;
}

export class CreateRegistrationBodyDto {
  @ApiProperty() @IsString() idempotencyKey!: string;
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty() @IsUUID() formVersionId!: string;
  @ApiProperty() @IsUUID() subjectPersonId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string | null;
  @ApiPropertyOptional({ type: [RegistrationItemDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RegistrationItemDto)
  items?: RegistrationItemDto[];
}

export class ReviewRegistrationBodyDto {
  @ApiProperty({ enum: ["approve", "reject", "waitlist", "start_review"] })
  @IsIn(["approve", "reject", "waitlist", "start_review"])
  action!: "approve" | "reject" | "waitlist" | "start_review";
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class WithdrawRegistrationBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class ListRegistrationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectPersonId?: string;
}

// ---------- Eligibility ----------

export class CreateEligibilityBodyDto {
  @ApiProperty() @IsUUID() personId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() governingBodyId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() ruleEvaluation?: Record<string, unknown>;
  @ApiPropertyOptional({ enum: ["pending", "eligible", "ineligible", "expired", "waived"] })
  @IsOptional() @IsIn(["pending", "eligible", "ineligible", "expired", "waived"])
  status?: "pending" | "eligible" | "ineligible" | "expired" | "waived";
}

export class ReevaluateEligibilityBodyDto {
  @ApiProperty() @IsObject() ruleEvaluation!: Record<string, unknown>;
  @ApiProperty({ enum: ["pending", "eligible", "ineligible", "expired", "waived"] })
  @IsIn(["pending", "eligible", "ineligible", "expired", "waived"])
  status!: string;
}

export class WaiveEligibilityBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
}

export class ListEligibilityQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() personId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() governingBodyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
