import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength
} from "class-validator";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import {
  PAYMENT_PROCESSOR,
  type PaymentProcessor
} from "../../../shared/payments/payment-processor";

// ---- DTOs ----
class WaiveLateFeeBodyDto {
  @IsString() @MinLength(10) reason!: string;
}

class ExtendDueDateBodyDto {
  @IsDateString() newDueAt!: string;
  @IsOptional() @IsString() reason?: string;
}

class ManualRemindBodyDto {
  @IsOptional() @IsString() channel?: "email" | "sms" | "in_app";
}

class SplitRefundBodyDto {
  @IsInt() @Min(0) cardAmountCents!: number;
  @IsInt() @Min(0) walletAmountCents!: number;
  @IsString() @MinLength(10) reason!: string;
  /** Currency for the wallet credit portion. Defaults to invoice currency. */
  @IsOptional() @IsString() currency?: string;
}

class IssueWalletCreditBodyDto {
  @IsInt() @Min(1) amountCents!: number;
  @IsString() @MinLength(10) reason!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() currency?: string;
}

class RetryQbSyncBodyDto {
  /** When true, clears the `forceFail` flag so the next cron pass succeeds. */
  @IsOptional() clearForceFail?: boolean;
}

/**
 * Spec 2 Phase 4 (refunds) + Phase 6 (AR dashboard actions) + Phase 7
 * (QB retry). All admin-only — guarded by SuperAdminGuard.
 */
@ApiTags("finance/ar-actions")
@ApiBearerAuth()
@Controller("finance")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceArActionsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor
  ) {}

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/waive-late-fee  (Phase 6)
  // -------------------------------------------------------------------
  @Post("invoices/:id/waive-late-fee")
  @ApiOperation({
    summary:
      "Remove the auto-applied late_fee invoice_item, recalculate total_cents, and flag the escalation as waived."
  })
  async waiveLateFee(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: WaiveLateFeeBodyDto
  ) {
    return await this.db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new NotFoundException("Invoice not found");

      const meta = (inv.metadata as Record<string, unknown>) ?? {};
      const lateFeeCents = (meta.lateFeeAppliedCents as number) ?? 0;
      if (!meta.lateFeeAppliedAt) {
        throw new ConflictException({
          error: "no_late_fee",
          message: "No late fee on this invoice."
        });
      }

      await tx
        .delete(schema.invoiceItems)
        .where(
          and(
            eq(schema.invoiceItems.invoiceId, invoiceId),
            eq(schema.invoiceItems.kind, "late_fee")
          )
        );

      await tx
        .update(schema.invoices)
        .set({
          totalCents: inv.totalCents - lateFeeCents,
          metadata: {
            ...meta,
            lateFeeWaivedAt: new Date().toISOString(),
            lateFeeWaivedByUserId: user.userId,
            lateFeeWaiveReason: body.reason.trim()
          },
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, invoiceId));

      await tx
        .update(schema.invoiceEscalations)
        .set({
          flagWaivedAt: new Date(),
          flagWaivedByUserId: user.userId,
          lastActionKind: "waive_late_fee",
          lastActionAt: new Date(),
          lastActionByUserId: user.userId,
          updatedAt: new Date()
        })
        .where(eq(schema.invoiceEscalations.invoiceId, invoiceId));

      return {
        invoiceId,
        waivedCents: lateFeeCents,
        newTotalCents: inv.totalCents - lateFeeCents
      };
    });
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/extend-due-date  (Phase 6)
  // -------------------------------------------------------------------
  @Post("invoices/:id/extend-due-date")
  @ApiOperation({
    summary:
      "Move the invoice's due date forward; remove the overdue flag if applicable."
  })
  async extendDueDate(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: ExtendDueDateBodyDto
  ) {
    const newDue = new Date(body.newDueAt);
    return await this.db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new NotFoundException("Invoice not found");

      const wasOverdue = inv.status === "overdue";
      const newStatus = wasOverdue && newDue > new Date()
        ? inv.paidCents > 0
          ? "partial"
          : "sent"
        : inv.status;

      await tx
        .update(schema.invoices)
        .set({
          dueAt: newDue,
          status: newStatus,
          metadata: {
            ...((inv.metadata as Record<string, unknown>) ?? {}),
            dueDateExtendedAt: new Date().toISOString(),
            dueDateExtendedByUserId: user.userId,
            dueDateExtendReason: body.reason ?? null
          },
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, invoiceId));

      await tx
        .update(schema.invoiceEscalations)
        .set({
          extendedDueAt: newDue,
          lastActionKind: "extend_due_date",
          lastActionAt: new Date(),
          lastActionByUserId: user.userId,
          updatedAt: new Date()
        })
        .where(eq(schema.invoiceEscalations.invoiceId, invoiceId));

      return {
        invoiceId,
        dueAt: newDue.toISOString(),
        status: newStatus
      };
    });
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/remind  (Phase 6)
  // -------------------------------------------------------------------
  @Post("invoices/:id/remind")
  @ApiOperation({
    summary:
      "Send an out-of-schedule manual reminder for an invoice. Logs to overdue_reminder_log + queues a notification."
  })
  async manualRemind(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: ManualRemindBodyDto
  ) {
    const [inv] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundException("Invoice not found");

    const channel = body.channel ?? "email";

    await this.db.insert(schema.notifications).values({
      orgId: inv.orgId,
      idempotencyKey: `manual-remind-${invoiceId}-${Date.now()}`,
      templateCode: "INVOICE_MANUAL_REMIND",
      channel,
      body: `Reminder: please complete payment on invoice ${inv.invoiceNumber}.`,
      recipientPersonId: inv.recipientPersonId,
      recipientEmail: inv.recipientEmail,
      payload: { invoiceId },
      sourceEvent: "admin.manual_remind",
      status: "queued"
    });

    const [esc] = await this.db
      .select()
      .from(schema.invoiceEscalations)
      .where(eq(schema.invoiceEscalations.invoiceId, invoiceId))
      .limit(1);
    if (esc) {
      await this.db.insert(schema.overdueReminderLog).values({
        escalationId: esc.id,
        invoiceId,
        channel,
        templateCode: "INVOICE_MANUAL_REMIND",
        status: "queued",
        sentAt: new Date(),
        metadata: { manualSentByUserId: user.userId }
      });
    }

    return { invoiceId, channel, status: "queued" as const };
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/refund-split  (Phase 4)
  // -------------------------------------------------------------------
  @Post("invoices/:id/refund-split")
  @ApiOperation({
    summary:
      "Issue a split refund: partial gateway refund + partial wallet credit. Two writes in sequence — gateway refund first, then wallet ledger credit. Reason required."
  })
  async refundSplit(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: SplitRefundBodyDto
  ) {
    if (body.cardAmountCents + body.walletAmountCents === 0) {
      throw new ConflictException({
        error: "no_amount",
        message: "Provide cardAmountCents and/or walletAmountCents > 0."
      });
    }

    const [inv] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundException("Invoice not found");

    if (
      body.cardAmountCents + body.walletAmountCents > inv.paidCents
    ) {
      throw new ConflictException({
        error: "exceeds_paid",
        message: "Refund total exceeds amount paid."
      });
    }

    const currency = body.currency ?? inv.currency;
    const cardRefund: { refundId: string | null } = { refundId: null };
    const walletLedgerId: { id: string | null } = { id: null };

    return await this.db.transaction(async (tx) => {
      // 1. Card portion via mock processor
      if (body.cardAmountCents > 0) {
        // Find the first succeeded card payment for this invoice
        const [pay] = await tx
          .select()
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.invoiceId, invoiceId),
              eq(schema.payments.method, "credit_card"),
              eq(schema.payments.status, "succeeded")
            )
          )
          .limit(1);
        if (!pay) {
          throw new ConflictException({
            error: "no_card_payment",
            message: "No succeeded card payment on this invoice to refund."
          });
        }

        const proc = await this.processor.refund({
          chargeId: pay.externalProviderId ?? "mock_pi_unknown",
          amountCents: body.cardAmountCents,
          reason: body.reason.trim()
        });
        if (proc.status !== "succeeded") {
          throw new ConflictException({
            error: "refund_failed",
            message: proc.failureMessage ?? "Refund failed at processor."
          });
        }

        const [r] = await tx
          .insert(schema.refunds)
          .values({
            orgId: inv.orgId,
            invoiceId,
            paymentId: pay.id,
            refundType:
              body.cardAmountCents === inv.paidCents
                ? "full_original"
                : "partial_original",
            amountCents: body.cardAmountCents,
            currency,
            reason: body.reason.trim(),
            issuedByUserId: user.userId,
            processorRefundId: proc.refundId,
            status: "succeeded",
            processedAt: new Date()
          })
          .returning({ id: schema.refunds.id });
        cardRefund.refundId = r!.id;
      }

      // 2. Wallet credit portion
      if (body.walletAmountCents > 0) {
        if (!inv.recipientPersonId) {
          throw new ConflictException({
            error: "no_recipient",
            message: "Cannot issue wallet credit — invoice has no recipient person."
          });
        }
        // Find or create wallet account
        let [wallet] = await tx
          .select()
          .from(schema.walletAccounts)
          .where(
            and(
              eq(schema.walletAccounts.personId, inv.recipientPersonId),
              eq(schema.walletAccounts.orgId, inv.orgId),
              eq(schema.walletAccounts.currency, currency)
            )
          )
          .limit(1);
        if (!wallet) {
          const created = await tx
            .insert(schema.walletAccounts)
            .values({
              personId: inv.recipientPersonId,
              orgId: inv.orgId,
              currency,
              balanceCents: 0
            })
            .returning();
          wallet = created[0]!;
        }

        await tx
          .update(schema.walletAccounts)
          .set({
            balanceCents: wallet.balanceCents + body.walletAmountCents,
            updatedAt: new Date()
          })
          .where(eq(schema.walletAccounts.id, wallet.id));

        const [refundRow] = await tx
          .insert(schema.refunds)
          .values({
            orgId: inv.orgId,
            invoiceId,
            refundType: "wallet_credit",
            amountCents: body.walletAmountCents,
            currency,
            reason: body.reason.trim(),
            issuedByUserId: user.userId,
            status: "succeeded",
            processedAt: new Date()
          })
          .returning({ id: schema.refunds.id });

        const ledger = await tx
          .insert(schema.walletLedger)
          .values({
            walletId: wallet.id,
            entryType: "credit_issued",
            amountCents: body.walletAmountCents,
            relatedInvoiceId: invoiceId,
            relatedRefundId: refundRow!.id,
            reason: body.reason.trim(),
            issuedByUserId: user.userId
          })
          .returning({ id: schema.walletLedger.id });
        walletLedgerId.id = ledger[0]!.id;
      }

      return {
        invoiceId,
        cardRefundId: cardRefund.refundId,
        walletLedgerId: walletLedgerId.id,
        cardAmountCents: body.cardAmountCents,
        walletAmountCents: body.walletAmountCents
      };
    });
  }

  // -------------------------------------------------------------------
  // POST /finance/persons/:personId/wallet-credit  (Phase 4 + 6)
  // Standalone wallet credit issuance (not tied to a refund).
  // -------------------------------------------------------------------
  @Post("persons/:personId/wallet-credit")
  @ApiOperation({
    summary:
      "Issue a wallet credit to a player not tied to an existing invoice. Use for admin discretionary credits."
  })
  async issueWalletCredit(
    @CurrentUser() user: AuthPrincipal,
    @Param("personId") personId: string,
    @Body() body: IssueWalletCreditBodyDto
  ) {
    const [person] = await this.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, personId))
      .limit(1);
    if (!person) throw new NotFoundException("Person not found");

    // Need an org context — pull from the person's first active membership.
    const [m] = await this.db
      .select({ orgId: schema.teams.orgId })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.teamMemberships.teamId)
      )
      .where(eq(schema.teamMemberships.personId, personId))
      .limit(1);
    if (!m) {
      throw new ConflictException({
        error: "no_org",
        message: "Cannot determine org for this person (no team memberships)."
      });
    }

    const currency = body.currency ?? "USD";
    return await this.db.transaction(async (tx) => {
      let [wallet] = await tx
        .select()
        .from(schema.walletAccounts)
        .where(
          and(
            eq(schema.walletAccounts.personId, personId),
            eq(schema.walletAccounts.orgId, m.orgId),
            eq(schema.walletAccounts.currency, currency)
          )
        )
        .limit(1);
      if (!wallet) {
        const created = await tx
          .insert(schema.walletAccounts)
          .values({
            personId,
            orgId: m.orgId,
            currency,
            balanceCents: 0
          })
          .returning();
        wallet = created[0]!;
      }

      await tx
        .update(schema.walletAccounts)
        .set({
          balanceCents: wallet.balanceCents + body.amountCents,
          updatedAt: new Date()
        })
        .where(eq(schema.walletAccounts.id, wallet.id));

      const ledger = await tx
        .insert(schema.walletLedger)
        .values({
          walletId: wallet.id,
          entryType: "credit_issued",
          amountCents: body.amountCents,
          reason: body.reason.trim(),
          issuedByUserId: user.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
        })
        .returning({ id: schema.walletLedger.id });

      return {
        walletId: wallet.id,
        ledgerId: ledger[0]!.id,
        newBalanceCents: wallet.balanceCents + body.amountCents
      };
    });
  }

  // -------------------------------------------------------------------
  // GET /finance/qb/queue  +  POST /finance/qb/retry/:id  (Phase 7)
  // -------------------------------------------------------------------
  @Get("qb/queue")
  @ApiOperation({
    summary:
      "QuickBooks sync queue + dead-letter view. Returns the 100 most recent rows; admin can retry failed ones."
  })
  async qbQueue() {
    const rows = await this.db
      .select()
      .from(schema.quickbooksSyncLogs)
      .orderBy(sql`${schema.quickbooksSyncLogs.attemptedAt} DESC`)
      .limit(100);
    return {
      items: rows.map((r) => ({
        id: r.id,
        orgId: r.orgId,
        entityType: r.entityType,
        entityId: r.entityId,
        qbId: r.qbId,
        action: r.action,
        status: r.status,
        summary: r.summary,
        errorMessage: r.errorMessage,
        attemptedAt: r.attemptedAt.toISOString(),
        metadata: r.metadata
      }))
    };
  }

  @Post("qb/retry/:id")
  @ApiOperation({
    summary:
      "Re-queue a failed QB sync event from the dead-letter list. The next cron pass picks it up."
  })
  async qbRetry(
    @Param("id") eventId: string,
    @Body() body: RetryQbSyncBodyDto
  ) {
    const [row] = await this.db
      .select()
      .from(schema.quickbooksSyncLogs)
      .where(eq(schema.quickbooksSyncLogs.id, eventId))
      .limit(1);
    if (!row) throw new NotFoundException("Sync event not found");
    if (row.status === "succeeded") {
      throw new ConflictException({
        error: "already_succeeded",
        message: "This event has already synced successfully."
      });
    }
    const metadata = (row.metadata as Record<string, unknown>) ?? {};
    if (body.clearForceFail) delete metadata.forceFail;
    delete metadata.attemptCount;

    await this.db
      .update(schema.quickbooksSyncLogs)
      .set({
        status: "queued",
        errorMessage: null,
        metadata: {
          ...metadata,
          requeuedAt: new Date().toISOString()
        }
      })
      .where(eq(schema.quickbooksSyncLogs.id, eventId));

    return { eventId, status: "queued" as const };
  }
}
