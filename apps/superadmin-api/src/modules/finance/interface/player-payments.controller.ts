import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import {
  PAYMENT_PROCESSOR,
  type PaymentProcessor
} from "../../../shared/payments/payment-processor";

class PayInvoiceBodyDto {
  /** Amount to apply from wallet, in cents. 0 or unset = card-only. */
  @IsOptional() @IsInt() @Min(0) walletAmountCents?: number;
  /** Amount to charge to card, in cents. 0 or unset = wallet-only. */
  @IsOptional() @IsInt() @Min(0) cardAmountCents?: number;
  /**
   * Mock outcome for the card portion. Mirrors public-registration
   * pay pattern; swap for a real Stripe payment-intent confirm when
   * @stripe/stripe-node lands.
   */
  @IsOptional()
  @IsIn(["succeeded", "failed"])
  mockOutcome?: "succeeded" | "failed";
}

class RetryInstallmentBodyDto {
  @IsOptional()
  @IsIn(["succeeded", "failed"])
  mockOutcome?: "succeeded" | "failed";
}

/**
 * Player-facing self-service payment endpoints.
 *
 * Three flows, all routed through POST /finance/invoices/:id/pay:
 *   - card-only (cardAmountCents = total, walletAmountCents = 0)
 *   - wallet-only (walletAmountCents = total, cardAmountCents = 0)
 *   - split (both > 0, sum must equal outstanding balance)
 *
 * Plus a player-initiated installment retry. Mock outcomes mirror
 * the existing public-registration pay endpoint so the state machine
 * can be exercised before Stripe is wired.
 */
@ApiTags("finance/player")
@ApiBearerAuth()
@Controller("finance")
@UseGuards(JwtAuthGuard)
export class PlayerPaymentsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor
  ) {}

  // -------------------------------------------------------------------
  // GET /finance/me/wallet
  // -------------------------------------------------------------------
  @Get("me/wallet")
  @ApiOperation({ summary: "The signed-in person's wallet accounts (one per org)." })
  async myWallet(@CurrentUser() user: AuthPrincipal) {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) return { accounts: [] };
    const accounts = await this.db
      .select()
      .from(schema.walletAccounts)
      .where(eq(schema.walletAccounts.personId, personId));
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        orgId: a.orgId,
        currency: a.currency,
        balanceCents: a.balanceCents,
        frozen: a.frozen,
        expiresAt: a.expiresAt?.toISOString() ?? null
      }))
    };
  }

  // -------------------------------------------------------------------
  // GET /finance/me/invoices
  // -------------------------------------------------------------------
  @Get("me/invoices")
  @ApiOperation({
    summary:
      "Invoices addressed to the signed-in person (sub-invoices + direct). Includes installment timeline for each."
  })
  async myInvoices(@CurrentUser() user: AuthPrincipal) {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) return { items: [] };

    const invoices = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.recipientPersonId, personId))
      .orderBy(desc(schema.invoices.createdAt))
      .limit(50);

    const invoiceIds = invoices.map((i) => i.id);
    const installments = invoiceIds.length
      ? await this.db
          .select()
          .from(schema.installmentSchedules)
          .where(
            sql`${schema.installmentSchedules.invoiceId} = ANY(${invoiceIds}::uuid[])`
          )
          .orderBy(schema.installmentSchedules.installmentNumber)
      : [];

    const byInvoice = new Map<string, typeof installments>();
    for (const ins of installments) {
      const arr = byInvoice.get(ins.invoiceId) ?? [];
      arr.push(ins);
      byInvoice.set(ins.invoiceId, arr);
    }

    return {
      items: invoices.map((inv) => ({
        id: inv.id,
        orgId: inv.orgId,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType,
        currency: inv.currency,
        subtotalCents: inv.subtotalCents,
        totalCents: inv.totalCents,
        paidCents: inv.paidCents,
        lateFeeAppliedCents: inv.lateFeeAppliedCents ?? 0,
        walletCreditAppliedCents: inv.walletCreditAppliedCents ?? 0,
        status: inv.status,
        dueAt: inv.dueAt?.toISOString() ?? null,
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        cardOnFile:
          (inv.metadata as { cardOnFile?: { brand: string; last4: string } })
            ?.cardOnFile ?? null,
        installments: (byInvoice.get(inv.id) ?? []).map((ins) => ({
          id: ins.id,
          installmentNumber: ins.installmentNumber,
          amountCents: ins.amountCents,
          dueDate: ins.dueDate ? ins.dueDate.toString() : null,
          status: ins.status,
          attemptCount: ins.attemptCount ?? 0,
          lastError: ins.lastErrorMessage ?? null
        }))
      }))
    };
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/pay
  // Combined wallet + card payment. Card uses a mock outcome until
  // Stripe is wired.
  // -------------------------------------------------------------------
  @Post("invoices/:id/pay")
  @ApiOperation({
    summary:
      "Combined invoice payment. Apply wallet credit (optional), charge card for remainder (optional). At least one of walletAmountCents / cardAmountCents must be > 0 and their sum must equal the outstanding balance. Atomic: all writes succeed or none."
  })
  async pay(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: PayInvoiceBodyDto
  ) {
    const wallet = body.walletAmountCents ?? 0;
    const card = body.cardAmountCents ?? 0;
    if (wallet + card === 0) {
      throw new ConflictException({
        error: "no_amount",
        message: "Specify walletAmountCents and/or cardAmountCents > 0."
      });
    }

    const personId = await this.resolvePersonId(user.userId);
    if (!personId) throw new ForbiddenException("No person record for this user");

    return await this.db.transaction(async (tx) => {
      // Lock the invoice row to serialise concurrent pay attempts,
      // then re-read via the typed select for the actual fields.
      await tx.execute(sql`
        SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
      `);
      const [locked] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .limit(1);
      if (!locked) throw new NotFoundException("Invoice not found");

      if (locked.recipientPersonId !== personId) {
        throw new ForbiddenException("Not your invoice");
      }

      if (locked.status === "paid" || locked.status === "void") {
        throw new ConflictException({
          error: "not_payable",
          message: `Invoice is ${locked.status}.`
        });
      }

      const totalCents = locked.totalCents;
      const paidAlready = locked.paidCents;
      const outstanding = totalCents - paidAlready;
      if (wallet + card !== outstanding) {
        throw new ConflictException({
          error: "amount_mismatch",
          message: `Provided ${wallet + card} cents; outstanding is ${outstanding}.`
        });
      }

      const orgId = locked.orgId;
      const currency = locked.currency;

      // 1. Wallet portion (if any)
      if (wallet > 0) {
        const [walletAcct] = await tx
          .select()
          .from(schema.walletAccounts)
          .where(
            and(
              eq(schema.walletAccounts.personId, personId),
              eq(schema.walletAccounts.orgId, orgId),
              eq(schema.walletAccounts.currency, currency)
            )
          )
          .limit(1);
        if (!walletAcct) {
          throw new ConflictException({
            error: "no_wallet",
            message: "No wallet account for this person in this org."
          });
        }
        if (walletAcct.frozen) {
          throw new ConflictException({
            error: "wallet_frozen",
            message: "Wallet is frozen — contact your league admin."
          });
        }
        if (walletAcct.balanceCents < wallet) {
          throw new ConflictException({
            error: "insufficient_wallet",
            message: `Wallet balance ${walletAcct.balanceCents} < requested ${wallet}.`
          });
        }

        await tx
          .update(schema.walletAccounts)
          .set({
            balanceCents: walletAcct.balanceCents - wallet,
            updatedAt: new Date()
          })
          .where(eq(schema.walletAccounts.id, walletAcct.id));

        await tx.insert(schema.walletLedger).values({
          walletId: walletAcct.id,
          entryType: "credit_applied",
          amountCents: -wallet,
          relatedInvoiceId: invoiceId,
          reason: "Invoice payment",
          metadata: { invoiceId }
        });

        await tx.insert(schema.payments).values({
          orgId,
          invoiceId,
          method: "manual",
          status: "succeeded",
          amountCents: wallet,
          currency,
          externalProviderId: `wallet:${walletAcct.id}:${invoiceId}`,
          metadata: { source: "wallet" }
        });
      }

      // 2. Card portion (if any) — routed through the PaymentProcessor
      //    seam. Mock impl today; real Stripe swap is one provider
      //    change in finance.module.ts.
      if (card > 0) {
        const charge = await this.processor.charge({
          amountCents: card,
          currency,
          description: `Invoice ${locked.invoiceNumber}`,
          mockOutcome: body.mockOutcome
        });
        if (charge.status !== "succeeded") {
          // Throw to unwind the transaction (wallet rolls back).
          throw new ConflictException({
            error: "card_declined",
            message:
              charge.failureMessage ??
              "Your card was declined. Update your card and try again."
          });
        }
        await tx.insert(schema.payments).values({
          orgId,
          invoiceId,
          method: "credit_card",
          status: "succeeded",
          amountCents: card,
          currency,
          externalProviderId: charge.intentId,
          metadata: { source: "card" }
        });
      }

      // 3. Update invoice paidCents + status
      const newPaid = paidAlready + wallet + card;
      const newStatus = newPaid >= totalCents ? "paid" : "partial";
      await tx
        .update(schema.invoices)
        .set({
          paidCents: newPaid,
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, invoiceId));

      return {
        invoiceId,
        status: newStatus,
        paidCents: newPaid,
        totalCents,
        walletApplied: wallet,
        cardCharged: card
      };
    });
  }

  // -------------------------------------------------------------------
  // POST /finance/installments/:id/retry
  // Player-initiated retry of a failed installment.
  // -------------------------------------------------------------------
  @Post("installments/:id/retry")
  @ApiOperation({
    summary:
      "Player retries a failed installment. Updates installment_schedules.status, optionally creates a payment row + updates invoice paidCents on success."
  })
  async retryInstallment(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") installmentId: string,
    @Body() body: RetryInstallmentBodyDto
  ) {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) throw new ForbiddenException("No person record");

    return await this.db.transaction(async (tx) => {
      const [ins] = await tx
        .select()
        .from(schema.installmentSchedules)
        .where(eq(schema.installmentSchedules.id, installmentId))
        .limit(1);
      if (!ins) throw new NotFoundException("Installment not found");
      if (ins.status !== "failed" && ins.status !== "scheduled") {
        throw new ConflictException({
          error: "not_retryable",
          message: `Installment is in status=${ins.status}.`
        });
      }

      const [inv] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, ins.invoiceId))
        .limit(1);
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.recipientPersonId !== personId) {
        throw new ForbiddenException("Not your installment");
      }

      const nextAttempt = (ins.attemptCount ?? 0) + 1;

      const charge = await this.processor.charge({
        amountCents: ins.amountCents,
        currency: inv.currency,
        description: `Installment ${ins.installmentNumber} retry`,
        mockOutcome: body.mockOutcome
      });

      if (charge.status !== "succeeded") {
        await tx
          .update(schema.installmentSchedules)
          .set({
            status: "failed",
            attemptCount: nextAttempt,
            lastErrorMessage: charge.failureMessage ?? "Card declined",
            updatedAt: new Date()
          })
          .where(eq(schema.installmentSchedules.id, installmentId));
        return {
          installmentId,
          status: "failed" as const,
          attemptCount: nextAttempt,
          message: "Card declined again. Update your card and try once more."
        };
      }

      // Success — record payment + advance invoice paidCents.
      await tx
        .update(schema.installmentSchedules)
        .set({
          status: "succeeded",
          attemptCount: nextAttempt,
          lastErrorMessage: null,
          chargedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.installmentSchedules.id, installmentId));

      await tx.insert(schema.payments).values({
        orgId: inv.orgId,
        invoiceId: inv.id,
        method: "credit_card",
        status: "succeeded",
        amountCents: ins.amountCents,
        currency: inv.currency,
        externalProviderId: charge.intentId,
        metadata: { installmentId, retry: true }
      });

      const newPaid = (inv.paidCents ?? 0) + ins.amountCents;
      const newStatus = newPaid >= inv.totalCents ? "paid" : "partial";
      await tx
        .update(schema.invoices)
        .set({
          paidCents: newPaid,
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, inv.id));

      return {
        installmentId,
        status: "succeeded" as const,
        attemptCount: nextAttempt,
        invoiceStatus: newStatus,
        invoicePaidCents: newPaid
      };
    });
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  private async resolvePersonId(userId: string): Promise<string | null> {
    const [p] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    return p?.id ?? null;
  }
}
