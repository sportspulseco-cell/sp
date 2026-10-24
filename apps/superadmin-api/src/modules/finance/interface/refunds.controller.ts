import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { and, desc, eq } from "drizzle-orm";
import { IsOptional, IsString, IsUUID } from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";

class ListRefundsQueryDto {
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() orgId?: string;
  @IsOptional() @IsString() status?: string;
}

interface RefundDto {
  id: string;
  orgId: string;
  invoiceId: string;
  paymentId: string | null;
  refundType: string;
  amountCents: number;
  currency: string;
  reason: string;
  issuedByUserId: string | null;
  processorRefundId: string | null;
  status: string;
  processedAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Refund history (read-only). Issuing a refund is one command,
 * RefundService, reached through POST /finance/invoices/:id/refund-split
 * (MON-9). The old POST /finance/refunds wrote a refund row without
 * touching the invoice or calling the processor, so it was removed.
 */
@ApiTags("finance/refunds")
@ApiBearerAuth()
@Controller("finance/refunds")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceRefundsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async list(@Query() q: ListRefundsQueryDto): Promise<RefundDto[]> {
    const conditions = [];
    if (q.invoiceId) conditions.push(eq(schema.refunds.invoiceId, q.invoiceId));
    if (q.orgId) conditions.push(eq(schema.refunds.orgId, q.orgId));
    if (q.status) conditions.push(eq(schema.refunds.status, q.status));

    const rows = await this.db
      .select()
      .from(schema.refunds)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.refunds.createdAt))
      .limit(200);

    return rows.map(toDto);
  }
}

function toDto(row: typeof schema.refunds.$inferSelect): RefundDto {
  return {
    id: row.id,
    orgId: row.orgId,
    invoiceId: row.invoiceId,
    paymentId: row.paymentId,
    refundType: row.refundType,
    amountCents: row.amountCents,
    currency: row.currency,
    reason: row.reason,
    issuedByUserId: row.issuedByUserId,
    processorRefundId: row.processorRefundId,
    status: row.status,
    processedAt: row.processedAt?.toISOString() ?? null,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
