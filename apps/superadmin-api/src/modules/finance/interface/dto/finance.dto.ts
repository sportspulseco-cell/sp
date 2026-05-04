import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested
} from "class-validator";

export class ListFeeSchedulesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;
}

export class UpsertFeeScheduleBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) baseAmountCents!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  dueOffsetDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  lateFeeCents?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: ["draft", "sent", "paid", "partial", "overdue", "void"] })
  @IsOptional()
  @IsIn(["draft", "sent", "paid", "partial", "overdue", "void"])
  status?: "draft" | "sent" | "paid" | "partial" | "overdue" | "void";
  @ApiPropertyOptional() @IsOptional() @IsUUID() recipientPersonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() registrationId?: string;
}

class CreateInvoiceItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiProperty() @IsString() description!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  quantity?: number;
  @ApiProperty() @Type(() => Number) @IsInt() unitAmountCents!: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() feeScheduleId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateInvoiceBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() registrationId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() recipientPersonId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() taxCents?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  discountCents?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() idempotencyKey?: string | null;
  @ApiProperty({ type: [CreateInvoiceItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoiceItemDto)
  items!: CreateInvoiceItemDto[];
}

export class VoidInvoiceBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class RecordPaymentBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) amountCents!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional({
    enum: ["cash", "check", "credit_card", "etransfer", "bank_transfer", "manual", "refund"]
  })
  @IsOptional()
  @IsIn(["cash", "check", "credit_card", "etransfer", "bank_transfer", "manual", "refund"])
  method?:
    | "cash"
    | "check"
    | "credit_card"
    | "etransfer"
    | "bank_transfer"
    | "manual"
    | "refund";
  @ApiPropertyOptional({ enum: ["pending", "succeeded", "failed", "refunded"] })
  @IsOptional()
  @IsIn(["pending", "succeeded", "failed", "refunded"])
  status?: "pending" | "succeeded" | "failed" | "refunded";
  @ApiPropertyOptional() @IsOptional() @IsDateString() receivedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() externalProviderId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
}
