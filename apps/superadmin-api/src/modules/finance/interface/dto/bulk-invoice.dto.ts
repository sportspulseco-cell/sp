import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

/**
 * Shared DTO for the `/finance/invoices/bulk` (super_admin) and
 * `/org-admin/finance/invoices/bulk` (org_admin proxy) endpoints. Both
 * controllers reuse the same shape + the same InvoicingService so the
 * bulk-create logic lives in exactly one place.
 */
export class BulkInvoiceItemDto {
  @IsString() @MinLength(1) description!: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsInt() @Min(1) unitAmountCents!: number;
  @IsString()
  @IsIn([
    "registration_fee",
    "jersey",
    "equipment",
    "late_fee",
    "discount",
    "other"
  ])
  kind!: string;
}

export class BulkCreateInvoiceBodyDto {
  @IsUUID() orgId!: string;
  @IsString()
  @IsIn(["individual", "team", "division", "league", "season", "org"])
  billingScope!: string;
  @IsUUID() targetId!: string;
  @IsOptional()
  @IsString()
  @IsIn(["manual", "registration", "team_dues", "sub_invoice", "referee_payroll"])
  invoiceType?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkInvoiceItemDto)
  items!: BulkInvoiceItemDto[];
  @IsDateString() dueAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() feeScheduleId?: string;
  @IsOptional() paymentPlanEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) depositCents?: number;
  @IsOptional() @IsInt() @Min(1) @Max(12) installmentCount?: number;
  @IsOptional() @IsDateString() installmentStartDate?: string;
}
