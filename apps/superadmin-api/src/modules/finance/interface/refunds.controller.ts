import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

class IssueRefundBodyDto {
  @IsUUID() invoiceId!: string;
  @IsOptional() @IsUUID() paymentId?: string | null;
  @IsIn(["full_original", "partial_original", "wallet_credit", "adjustment"])
  refundType!: "full_original" | "partial_original" | "wallet_credit" | "adjustment";
  @IsInt() @Min(1) amountCents!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

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
 * Refund issuance + history. The mockup's "Refund / credit" tab posts
 * to /finance/refunds. The processor side (Stripe RefundCreate) is a
 * separate worker — issuing here records the intent + creates the
 * audit row; status flips to "succeeded" / "failed" once the worker
 * round-trips.
 *
 * For wallet_credit type, we post a credit to the player's wallet in
 * the same transaction (no external gateway needed).
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

  @Post()
  @ApiOperation({
    summary:
      "Issue a refund. wallet_credit refunds also post a credit_issued ledger entry + bump the wallet balance atomically."
  })
  async issue(
    @Body() body: IssueRefundBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RefundDto> {
    // Sanity: invoice exists, refund <= max refundable.
    const [invoice] = await this.db
      .select({
        id: schema.invoices.id,
        orgId: schema.invoices.orgId,
        paidCents: schema.invoices.paidCents,
        currency: schema.invoices.currency,
        recipientPersonId: schema.invoices.recipientPersonId
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, body.invoiceId))
      .limit(1);
    if (!invoice) throw new NotFoundException("Invoice not found");

    if (body.amountCents > invoice.paidCents) {
      throw new BadRequestException(
        `Refund amount ${body.amountCents} exceeds maximum refundable ${invoice.paidCents}`
      );
    }

    // Issue the refund row (status=pending; worker flips to succeeded
    // when the gateway acknowledges, or we flip immediately for wallet_credit).
    const initialStatus =
      body.refundType === "wallet_credit" || body.refundType === "adjustment"
        ? "succeeded"
        : "pending";
    const processedAt =
      initialStatus === "succeeded" ? new Date() : null;

    const refund = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .insert(schema.refunds)
        .values({
          orgId: invoice.orgId,
          invoiceId: body.invoiceId,
          paymentId: body.paymentId ?? null,
          refundType: body.refundType,
          amountCents: body.amountCents,
          currency: invoice.currency,
          reason: body.reason,
          issuedByUserId: user.userId,
          status: initialStatus,
          processedAt
        })
        .returning();
      const row = r!;

      // Wallet credit type: bump the player's wallet + write a ledger row.
      if (body.refundType === "wallet_credit" && invoice.recipientPersonId) {
        // Upsert wallet account (one per person+org+currency).
        const [existingWallet] = await tx
          .select({ id: schema.walletAccounts.id })
          .from(schema.walletAccounts)
          .where(
            and(
              eq(schema.walletAccounts.personId, invoice.recipientPersonId),
              eq(schema.walletAccounts.orgId, invoice.orgId),
              eq(schema.walletAccounts.currency, invoice.currency)
            )
          )
          .limit(1);

        let walletId: string;
        if (existingWallet) {
          walletId = existingWallet.id;
          await tx
            .update(schema.walletAccounts)
            .set({
              balanceCents: sql`${schema.walletAccounts.balanceCents} + ${body.amountCents}`,
              updatedAt: sql`now()`
            })
            .where(eq(schema.walletAccounts.id, walletId));
        } else {
          const [created] = await tx
            .insert(schema.walletAccounts)
            .values({
              personId: invoice.recipientPersonId,
              orgId: invoice.orgId,
              currency: invoice.currency,
              balanceCents: body.amountCents
            })
            .returning({ id: schema.walletAccounts.id });
          walletId = created!.id;
        }

        await tx.insert(schema.walletLedger).values({
          walletId,
          entryType: "credit_issued",
          amountCents: body.amountCents,
          relatedInvoiceId: body.invoiceId,
          relatedRefundId: row.id,
          reason: body.reason,
          issuedByUserId: user.userId
        });
      }

      return row;
    });

    return toDto(refund);
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
