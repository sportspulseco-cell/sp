import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
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
import { NotificationService } from "../../communications/application/notification.service";
import { settleInstallments } from "../application/services/installments";
import { statusForMoney } from "../domain/invoice-money";
import { formatMoney, invoiceLineLabel, invoicePayRange, invoiceTitle } from "@sportspulse/kernel";

function fmtMoneyCents(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${amount} ${currency}`;
}

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
  /**
   * One key per Pay dialog. A second request with the same key (double
   * click, retry after a lost response) returns the first result and
   * charges nothing: a part payment on a plan would otherwise be taken
   * twice, since the second one still fits the next installment.
   */
  @IsOptional() @IsString() @MaxLength(100) idempotencyKey?: string;
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
  private readonly log = new Logger(PlayerPaymentsController.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor,
    private readonly notify: NotificationService
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

    const rows = await this.db
      .select({
        inv: schema.invoices,
        teamName: schema.teams.name
      })
      .from(schema.invoices)
      .leftJoin(schema.teams, eq(schema.teams.id, schema.invoices.teamId))
      // Drafts are admin-only until the admin sends them.
      .where(
        and(
          eq(schema.invoices.recipientPersonId, personId),
          ne(schema.invoices.status, "draft")
        )
      )
      .orderBy(desc(schema.invoices.createdAt))
      .limit(50);
    const invoices = rows.map((r) => ({ ...r.inv, teamName: r.teamName }));

    const invoiceIds = invoices.map((i) => i.id);
    // inArray(...) — sql`ANY(${arr}::uuid[])` round-trips the array as
    // a comma-joined string, which Postgres rejects as a malformed
    // array literal (see commit 537f2ca for the same fix elsewhere).
    const installments = invoiceIds.length
      ? await this.db
          .select()
          .from(schema.installmentSchedules)
          .where(inArray(schema.installmentSchedules.invoiceId, invoiceIds))
          .orderBy(schema.installmentSchedules.installmentNumber)
      : [];

    // Refunds per invoice, so the player sees why a total went down (MON-9).
    const refundRows = invoiceIds.length
      ? await this.db
          .select({
            invoiceId: schema.refunds.invoiceId,
            cents: sql<number>`COALESCE(SUM(${schema.refunds.amountCents}), 0)::int`
          })
          .from(schema.refunds)
          .where(
            and(
              inArray(schema.refunds.invoiceId, invoiceIds),
              inArray(schema.refunds.status, ["succeeded", "pending"])
            )
          )
          .groupBy(schema.refunds.invoiceId)
      : [];
    const refundedBy = new Map(refundRows.map((r) => [r.invoiceId, Number(r.cents)]));

    // The lines say what each invoice is for (registration, team dues
    // share, store order, the admin's own description, late fee).
    const lineRows = invoiceIds.length
      ? await this.db
          .select({
            invoiceId: schema.invoiceItems.invoiceId,
            kind: schema.invoiceItems.kind,
            description: schema.invoiceItems.description,
            quantity: schema.invoiceItems.quantity,
            amountCents: schema.invoiceItems.amountCents
          })
          .from(schema.invoiceItems)
          .where(inArray(schema.invoiceItems.invoiceId, invoiceIds))
          .orderBy(schema.invoiceItems.createdAt)
      : [];
    const linesBy = new Map<string, typeof lineRows>();
    for (const l of lineRows) linesBy.set(l.invoiceId, [...(linesBy.get(l.invoiceId) ?? []), l]);

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
        registrationId: inv.registrationId,
        title: invoiceTitle({
          invoiceType: inv.invoiceType,
          registrationId: inv.registrationId,
          metadata: inv.metadata as Record<string, unknown>,
          lines: linesBy.get(inv.id) ?? []
        }),
        lines: (linesBy.get(inv.id) ?? []).map((l) => ({
          kind: l.kind,
          label: invoiceLineLabel(l),
          quantity: l.quantity,
          amountCents: l.amountCents
        })),
        // What the player may pay now: the next installment up to the
        // whole balance on a plan, the balance otherwise (same rule as pay).
        payRange: invoicePayRange({
          totalCents: inv.totalCents,
          paidCents: inv.paidCents,
          installments: (byInvoice.get(inv.id) ?? []).map((ins) => ({
            installmentNumber: ins.installmentNumber,
            amountCents: ins.amountCents,
            status: ins.status,
            dueDate: ins.dueDate ? ins.dueDate.toISOString() : null
          }))
        }),
        teamId: inv.teamId,
        teamName: inv.teamName,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType,
        currency: inv.currency,
        subtotalCents: inv.subtotalCents,
        totalCents: inv.totalCents,
        paidCents: inv.paidCents,
        lateFeeAppliedCents: inv.lateFeeAppliedCents ?? 0,
        walletCreditAppliedCents: inv.walletCreditAppliedCents ?? 0,
        refundedCents: refundedBy.get(inv.id) ?? 0,
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
      "Combined invoice payment. Apply wallet credit (optional), charge card for remainder (optional). At least one of walletAmountCents / cardAmountCents must be > 0. Without a payment plan their sum must equal the outstanding balance; on a plan it may be anything from the next installment up to the balance. Atomic: all writes succeed or none."
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

      if (body.idempotencyKey) {
        const earlier = await tx
          .select({ id: schema.payments.id, amountCents: schema.payments.amountCents, source: sql<string>`${schema.payments.metadata}->>'source'` })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.invoiceId, invoiceId),
              sql`${schema.payments.metadata}->>'payKey' = ${body.idempotencyKey}`
            )
          );
        if (earlier.length > 0) {
          this.log.log(`player pay replay invoice=${invoiceId} key=${body.idempotencyKey} payments=${earlier.length}`);
          return {
            invoiceId,
            status: locked.status,
            paidCents: locked.paidCents,
            totalCents: locked.totalCents,
            walletApplied: earlier.filter((p) => p.source === "wallet").reduce((a, p) => a + p.amountCents, 0),
            cardCharged: earlier.filter((p) => p.source === "card").reduce((a, p) => a + p.amountCents, 0),
            idempotent: true,
            _emailContext: null
          };
        }
      }

      if (locked.status === "paid" || locked.status === "void") {
        throw new ConflictException({
          error: "not_payable",
          message: `Invoice is ${locked.status}.`
        });
      }

      const totalCents = locked.totalCents;
      const paidAlready = locked.paidCents;
      // A payer on a payment plan may pay the next installment, or any
      // amount up to the whole balance; without a plan the balance is
      // due in full (kernel invoicePayRange). Before, a plan payer could
      // only pay everything at once.
      const plan = await tx
        .select({
          installmentNumber: schema.installmentSchedules.installmentNumber,
          amountCents: schema.installmentSchedules.amountCents,
          status: schema.installmentSchedules.status
        })
        .from(schema.installmentSchedules)
        .where(eq(schema.installmentSchedules.invoiceId, invoiceId));
      const range = invoicePayRange({ totalCents, paidCents: paidAlready, installments: plan });
      const amount = wallet + card;
      if (amount > range.maxCents) {
        throw new ConflictException({
          error: "amount_too_high",
          message: `That is more than the ${formatMoney(range.maxCents, locked.currency)} you owe on this invoice.`
        });
      }
      if (amount < range.minCents) {
        throw new ConflictException({
          error: "amount_too_low",
          message: range.nextInstallment
            ? `Pay at least the next installment, ${formatMoney(range.minCents, locked.currency)}.`
            : `Pay the whole balance, ${formatMoney(range.minCents, locked.currency)}.`
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
          // One wallet payment per invoice per pay request (the old key
          // allowed only one wallet payment per invoice ever).
          externalProviderId: `wallet:${walletAcct.id}:${invoiceId}:${paidAlready}`,
          metadata: { source: "wallet", ...(body.idempotencyKey ? { payKey: body.idempotencyKey } : {}) }
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
          metadata: { source: "card", ...(body.idempotencyKey ? { payKey: body.idempotencyKey } : {}) }
        });
      }

      // 3. Update invoice paidCents + status (overdue stays overdue while
      //    a balance remains; only the sweep or an extension moves it).
      const newPaid = paidAlready + wallet + card;
      const newStatus = statusForMoney({ status: locked.status, totalCents, paidCents: newPaid });
      await tx
        .update(schema.invoices)
        .set({
          paidCents: newPaid,
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, invoiceId));
      // The plan follows the money (MON-27).
      const settled = await settleInstallments(tx, invoiceId);
      this.log.log(
        `player pay invoice=${invoiceId} wallet=${wallet} card=${card} paid=${newPaid}/${totalCents} status=${newStatus} installmentsSettled=${settled}`
      );

      return {
        invoiceId,
        status: newStatus,
        paidCents: newPaid,
        totalCents,
        walletApplied: wallet,
        cardCharged: card,
        _emailContext: {
          recipientEmail: locked.recipientEmail,
          recipientPersonId: locked.recipientPersonId,
          invoiceNumber: locked.invoiceNumber,
          teamId: locked.teamId,
          amountCents: wallet + card,
          currency
        }
      };
    }).then(async (result) => {
      // Fan-out the payment-received email after the transaction
      // commits. Audit P3-2 / §1.3: include the team name in the
      // subject + body so the player sees what this invoice was for.
      const ctx = result._emailContext;
      if (!ctx) {
        const { _emailContext: _none, ...replay } = result;
        void _none;
        return replay;
      }
      let teamName: string | null = null;
      if (ctx.teamId) {
        const [t] = await this.db
          .select({ name: schema.teams.name })
          .from(schema.teams)
          .where(eq(schema.teams.id, ctx.teamId))
          .limit(1);
        teamName = t?.name ?? null;
      }
      void this.notify.queue({
        templateCode: "payment.confirmed",
        idempotencyKey: `pay-confirmed-${result.invoiceId}-${result.paidCents}`,
        recipientPersonId: ctx.recipientPersonId,
        recipientEmail: ctx.recipientEmail,
        payload: {
          invoiceNumber: ctx.invoiceNumber,
          amountCents: fmtMoneyCents(ctx.amountCents, ctx.currency),
          teamClause: teamName ? ` (${teamName})` : "",
          teamLine: teamName ? `\nTeam: ${teamName}` : ""
        }
      });
      // Strip the internal-only context before returning to the client.
      const { _emailContext: _ignore, ...clean } = result;
      void _ignore;
      return clean;
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
