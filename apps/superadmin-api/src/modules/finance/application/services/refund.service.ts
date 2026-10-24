import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  PAYMENT_PROCESSOR,
  type PaymentProcessor
} from "../../../../shared/payments/payment-processor";
import { NotificationService } from "../../../communications/application/notification.service";
import {
  cardRefundableCents,
  refundableCents,
  statusForMoney
} from "../../domain/invoice-money";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

export interface IssueRefundCommand {
  invoiceId: string;
  /** Back to the card(s) the invoice was paid with, via the payment processor. */
  cardAmountCents: number;
  /** Credit to the recipient's SportsPulse wallet for this org. */
  walletAmountCents: number;
  reason: string;
  /** Required. A replay with the same key returns the first result. */
  idempotencyKey: string;
  actorUserId: string;
}

export interface RefundableSummary {
  /** Most that can be refunded now (card + wallet together). */
  totalCents: number;
  /** Most that can go back to a card (card charges minus card refunds). */
  cardCents: number;
  /** Sum of every refund already recorded on the invoice. */
  refundedCents: number;
}

export interface IssueRefundResult {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  paidCents: number;
  cardRefundId: string | null;
  walletLedgerId: string | null;
  cardAmountCents: number;
  walletAmountCents: number;
  walletBalanceCents: number | null;
  refundable: RefundableSummary;
  /** true when this was a replay of an earlier request with the same key. */
  idempotent: boolean;
}

/** Refund rows that count against the invoice (not failed / cancelled). */
const LIVE_REFUND_STATUSES = ["succeeded", "pending"];
const CARD_REFUND_TYPES = ["full_original", "partial_original"];

function fmtCents(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

/**
 * The one refund command (MON-9, UC-17). Both admin refund screens
 * (invoice detail dialog and the Payments > Refund tab) call it through
 * POST /finance/invoices/:id/refund-split.
 *
 * One transaction, invoice row locked FOR UPDATE:
 *   1. replay check on the idempotency key (stored on the refund rows)
 *   2. amount <= refundable, card part <= card money still on the card
 *   3. card part: PaymentProcessor.refund per card charge (mock today)
 *   4. wallet part: wallet balance + wallet_ledger credit_issued
 *   5. invoice total and paid both lowered by the amount, status
 *      recomputed from the money (domain/invoice-money.ts)
 *   6. readback of the invoice, refunds and wallet
 * After commit: refund.issued notification to the recipient.
 */
@Injectable()
export class RefundService {
  private readonly log = new Logger(RefundService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor,
    private readonly notify: NotificationService
  ) {}

  /** Refundable amounts for an invoice, computed from its rows. */
  async refundable(invoiceId: string, db: Db = this.db): Promise<RefundableSummary> {
    const [inv] = await db
      .select({ paidCents: schema.invoices.paidCents })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundException("Invoice not found");
    return this.computeRefundable(db, invoiceId, inv.paidCents);
  }

  private async computeRefundable(
    db: Db,
    invoiceId: string,
    paidCents: number
  ): Promise<RefundableSummary> {
    const [r] = await db
      .select({
        refunded: sql<number>`COALESCE(SUM(${schema.refunds.amountCents}), 0)::int`,
        unadjusted: sql<number>`COALESCE(SUM(${schema.refunds.amountCents}) FILTER (WHERE COALESCE((${schema.refunds.metadata}->>'invoiceAdjusted')::boolean, false) = false), 0)::int`,
        cardRefunded: sql<number>`COALESCE(SUM(${schema.refunds.amountCents}) FILTER (WHERE ${schema.refunds.refundType} IN ('full_original','partial_original')), 0)::int`
      })
      .from(schema.refunds)
      .where(
        and(
          eq(schema.refunds.invoiceId, invoiceId),
          inArray(schema.refunds.status, LIVE_REFUND_STATUSES)
        )
      );
    const [p] = await db
      .select({
        card: sql<number>`COALESCE(SUM(${schema.payments.amountCents}), 0)::int`
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.invoiceId, invoiceId),
          eq(schema.payments.method, "credit_card"),
          eq(schema.payments.status, "succeeded")
        )
      );
    const total = refundableCents({
      paidCents,
      unadjustedRefundCents: Number(r?.unadjusted ?? 0)
    });
    return {
      totalCents: total,
      cardCents: Math.min(
        total,
        cardRefundableCents({
          cardPaidCents: Number(p?.card ?? 0),
          cardRefundedCents: Number(r?.cardRefunded ?? 0)
        })
      ),
      refundedCents: Number(r?.refunded ?? 0)
    };
  }

  async issue(cmd: IssueRefundCommand): Promise<IssueRefundResult> {
    const card = cmd.cardAmountCents ?? 0;
    const wallet = cmd.walletAmountCents ?? 0;
    const amount = card + wallet;
    const reason = (cmd.reason ?? "").trim();
    if (!cmd.idempotencyKey) {
      throw new BadRequestException("X-Idempotency-Key header is required.");
    }
    if (!Number.isInteger(card) || !Number.isInteger(wallet) || card < 0 || wallet < 0) {
      throw new BadRequestException("Refund amounts must be whole cents, zero or more.");
    }
    if (amount === 0) {
      throw new BadRequestException("Enter a refund amount above zero.");
    }
    if (reason.length < 10) {
      throw new BadRequestException("Reason must be at least 10 characters.");
    }

    let result: IssueRefundResult & {
      _notify?: {
        orgId: string;
        recipientPersonId: string | null;
        recipientEmail: string | null;
        currency: string;
        firstRefundId: string;
      };
    };
    try {
      result = await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM invoices WHERE id = ${cmd.invoiceId} FOR UPDATE`
        );
        const [inv] = await tx
          .select()
          .from(schema.invoices)
          .where(eq(schema.invoices.id, cmd.invoiceId))
          .limit(1);
        if (!inv) throw new NotFoundException("Invoice not found");

        // 1. Replay: the same key already produced refund rows.
        const prior = await tx
          .select()
          .from(schema.refunds)
          .where(
            and(
              eq(schema.refunds.invoiceId, inv.id),
              sql`${schema.refunds.metadata}->>'idempotencyKey' = ${cmd.idempotencyKey}`
            )
          );
        if (prior.length > 0) {
          const walletRow = prior.find((r) => r.refundType === "wallet_credit");
          const cardRows = prior.filter((r) => CARD_REFUND_TYPES.includes(r.refundType));
          const [ledger] = walletRow
            ? await tx
                .select({ id: schema.walletLedger.id })
                .from(schema.walletLedger)
                .where(eq(schema.walletLedger.relatedRefundId, walletRow.id))
                .limit(1)
            : [];
          this.log.log(
            `refund replay invoice=${inv.id} key=${cmd.idempotencyKey} rows=${prior.length}`
          );
          return {
            ...(await this.readback(tx, inv.id)),
            cardRefundId: cardRows[0]?.id ?? null,
            walletLedgerId: ledger?.id ?? null,
            cardAmountCents: cardRows.reduce((a, r) => a + r.amountCents, 0),
            walletAmountCents: walletRow?.amountCents ?? 0,
            idempotent: true
          };
        }

        // 2. Limits, from the locked rows.
        if (inv.status === "void") {
          throw new ConflictException(
            "This invoice is void. Nothing was paid on it to refund."
          );
        }
        const before = await this.computeRefundable(tx, inv.id, inv.paidCents);
        if (amount > before.totalCents) {
          throw new ConflictException(
            `Refund of ${fmtCents(amount, inv.currency)} is more than the ${fmtCents(before.totalCents, inv.currency)} still refundable on ${inv.invoiceNumber}.`
          );
        }
        if (card > before.cardCents) {
          throw new ConflictException(
            before.cardCents === 0
              ? `${inv.invoiceNumber} has no card payment to refund. Refund it as wallet credit instead.`
              : `Only ${fmtCents(before.cardCents, inv.currency)} of ${inv.invoiceNumber} was paid by card. Refund the rest as wallet credit.`
          );
        }
        if (wallet > 0 && !inv.recipientPersonId) {
          throw new ConflictException(
            `${inv.invoiceNumber} has no recipient person, so there is no wallet to credit. Refund to the card instead.`
          );
        }

        const meta = {
          idempotencyKey: cmd.idempotencyKey,
          invoiceAdjusted: true
        };
        let cardRefundId: string | null = null;
        let firstRefundId: string | null = null;

        // 3. Card part: one processor refund per card charge, oldest first.
        if (card > 0) {
          const charges = await tx
            .select()
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.invoiceId, inv.id),
                eq(schema.payments.method, "credit_card"),
                eq(schema.payments.status, "succeeded")
              )
            )
            .orderBy(asc(schema.payments.receivedAt));
          const refundedPerCharge = await tx
            .select({
              paymentId: schema.refunds.paymentId,
              cents: sql<number>`COALESCE(SUM(${schema.refunds.amountCents}), 0)::int`
            })
            .from(schema.refunds)
            .where(
              and(
                eq(schema.refunds.invoiceId, inv.id),
                inArray(schema.refunds.refundType, CARD_REFUND_TYPES),
                inArray(schema.refunds.status, LIVE_REFUND_STATUSES)
              )
            )
            .groupBy(schema.refunds.paymentId);
          const used = new Map(
            refundedPerCharge.map((r) => [r.paymentId, Number(r.cents)])
          );
          let left = card;
          for (const charge of charges) {
            if (left === 0) break;
            const room = charge.amountCents - (used.get(charge.id) ?? 0);
            if (room <= 0) continue;
            const part = Math.min(room, left);
            const proc = await this.processor.refund({
              chargeId: charge.externalProviderId ?? `payment:${charge.id}`,
              amountCents: part,
              reason,
              metadata: { invoiceId: inv.id, idempotencyKey: cmd.idempotencyKey }
            });
            if (proc.status !== "succeeded") {
              // Throwing rolls back every row written so far in this command.
              throw new ConflictException(
                `The payment processor refused the card refund: ${proc.failureMessage ?? "no reason given"}. Nothing was refunded.`
              );
            }
            const [row] = await tx
              .insert(schema.refunds)
              .values({
                orgId: inv.orgId,
                invoiceId: inv.id,
                paymentId: charge.id,
                refundType:
                  part === charge.amountCents ? "full_original" : "partial_original",
                amountCents: part,
                currency: inv.currency,
                reason,
                issuedByUserId: cmd.actorUserId,
                processorRefundId: proc.refundId,
                status: "succeeded",
                processedAt: new Date(),
                metadata: { ...meta, destination: "card" }
              })
              .returning({ id: schema.refunds.id });
            cardRefundId ??= row!.id;
            firstRefundId ??= row!.id;
            left -= part;
          }
          if (left !== 0) {
            // computeRefundable said the card money was there; the
            // per-charge walk disagrees. Refuse rather than guess.
            throw new ConflictException(
              `Could not match ${fmtCents(left, inv.currency)} of the card refund to a card payment on ${inv.invoiceNumber}. Nothing was refunded.`
            );
          }
        }

        // 4. Wallet part.
        let walletLedgerId: string | null = null;
        if (wallet > 0) {
          const personId = inv.recipientPersonId!;
          await tx
            .insert(schema.walletAccounts)
            .values({
              personId,
              orgId: inv.orgId,
              currency: inv.currency,
              balanceCents: 0
            })
            .onConflictDoNothing();
          const [acct] = await tx
            .select()
            .from(schema.walletAccounts)
            .where(
              and(
                eq(schema.walletAccounts.personId, personId),
                eq(schema.walletAccounts.orgId, inv.orgId),
                eq(schema.walletAccounts.currency, inv.currency)
              )
            )
            .limit(1);
          if (!acct) throw new Error("wallet account missing after upsert");
          if (acct.frozen) {
            throw new ConflictException(
              "The player's wallet is frozen, so it cannot be credited. Unfreeze it or refund to the card."
            );
          }
          const updated = await tx
            .update(schema.walletAccounts)
            .set({
              balanceCents: sql`${schema.walletAccounts.balanceCents} + ${wallet}`,
              updatedAt: new Date()
            })
            .where(eq(schema.walletAccounts.id, acct.id))
            .returning({ id: schema.walletAccounts.id });
          if (updated.length !== 1) {
            throw new Error(`wallet credit touched ${updated.length} rows`);
          }
          const [refundRow] = await tx
            .insert(schema.refunds)
            .values({
              orgId: inv.orgId,
              invoiceId: inv.id,
              refundType: "wallet_credit",
              amountCents: wallet,
              currency: inv.currency,
              reason,
              issuedByUserId: cmd.actorUserId,
              status: "succeeded",
              processedAt: new Date(),
              metadata: { ...meta, destination: "wallet" }
            })
            .returning({ id: schema.refunds.id });
          const [ledger] = await tx
            .insert(schema.walletLedger)
            .values({
              walletId: acct.id,
              entryType: "credit_issued",
              amountCents: wallet,
              relatedInvoiceId: inv.id,
              relatedRefundId: refundRow!.id,
              reason,
              issuedByUserId: cmd.actorUserId
            })
            .returning({ id: schema.walletLedger.id });
          walletLedgerId = ledger!.id;
          firstRefundId ??= refundRow!.id;
        }

        // 5. Invoice: the refunded part is no longer billed or paid.
        const totalCents = inv.totalCents - amount;
        const paidCents = inv.paidCents - amount;
        const status = statusForMoney({
          status: inv.status,
          totalCents,
          paidCents
        });
        const touched = await tx
          .update(schema.invoices)
          .set({
            totalCents,
            paidCents,
            status,
            paidAt: status === "paid" ? inv.paidAt ?? new Date() : null,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(schema.invoices.id, inv.id),
              eq(schema.invoices.paidCents, inv.paidCents),
              ne(schema.invoices.status, "void")
            )
          )
          .returning({ id: schema.invoices.id });
        if (touched.length !== 1) {
          throw new Error(
            `refund invoice update touched ${touched.length} rows (invoice ${inv.id})`
          );
        }

        // 6. Readback inside the transaction.
        const rb = await this.readback(tx, inv.id);
        if (rb.paidCents !== paidCents || rb.totalCents !== totalCents) {
          throw new Error(
            `refund readback mismatch on ${inv.id}: paid ${rb.paidCents}/${paidCents} total ${rb.totalCents}/${totalCents}`
          );
        }
        this.log.log(
          `refund issued invoice=${inv.invoiceNumber} card=${card} wallet=${wallet} paid ${inv.paidCents}->${paidCents} total ${inv.totalCents}->${totalCents} status ${inv.status}->${status} refundable ${before.totalCents}->${rb.refundable.totalCents}`
        );
        return {
          ...rb,
          cardRefundId,
          walletLedgerId,
          cardAmountCents: card,
          walletAmountCents: wallet,
          idempotent: false,
          _notify: {
            orgId: inv.orgId,
            recipientPersonId: inv.recipientPersonId,
            recipientEmail: inv.recipientEmail,
            currency: inv.currency,
            firstRefundId: firstRefundId!
          }
        };
      });
    } catch (err) {
      this.log.warn(
        `refund refused invoice=${cmd.invoiceId} card=${card} wallet=${wallet}: ${(err as Error).message}`
      );
      throw err;
    }

    const { _notify, ...clean } = result;
    if (_notify) {
      const processingNote =
        card > 0 && wallet > 0
          ? `We refunded ${fmtCents(card, _notify.currency)} to your card and added ${fmtCents(wallet, _notify.currency)} to your SportsPulse wallet for invoice ${clean.invoiceNumber}.`
          : card > 0
            ? `We refunded ${fmtCents(card, _notify.currency)} to your card for invoice ${clean.invoiceNumber}.`
            : `We added ${fmtCents(wallet, _notify.currency)} to your SportsPulse wallet for invoice ${clean.invoiceNumber}.`;
      const row = await this.notify.queue({
        orgId: _notify.orgId,
        templateCode: "refund.issued",
        idempotencyKey: `refund-issued-${_notify.firstRefundId}`,
        recipientPersonId: _notify.recipientPersonId,
        recipientEmail: _notify.recipientEmail,
        payload: {
          amountCents: fmtCents(amount, _notify.currency),
          reason,
          processingNote,
          invoiceId: clean.invoiceId,
          invoiceNumber: clean.invoiceNumber
        },
        sourceEvent: "finance.refund_issued"
      });
      if (!row) {
        this.log.warn(
          `refund.issued notification not written for invoice=${clean.invoiceId} (refund itself committed)`
        );
      }
    }
    return clean;
  }

  private async readback(
    db: Db,
    invoiceId: string
  ): Promise<
    Pick<
      IssueRefundResult,
      | "invoiceId"
      | "invoiceNumber"
      | "status"
      | "totalCents"
      | "paidCents"
      | "walletBalanceCents"
      | "refundable"
    >
  > {
    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundException("Invoice not found");
    const refundable = await this.computeRefundable(db, inv.id, inv.paidCents);
    let walletBalanceCents: number | null = null;
    if (inv.recipientPersonId) {
      const [w] = await db
        .select({ balance: schema.walletAccounts.balanceCents })
        .from(schema.walletAccounts)
        .where(
          and(
            eq(schema.walletAccounts.personId, inv.recipientPersonId),
            eq(schema.walletAccounts.orgId, inv.orgId),
            eq(schema.walletAccounts.currency, inv.currency)
          )
        )
        .limit(1);
      walletBalanceCents = w?.balance ?? null;
    }
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      totalCents: inv.totalCents,
      paidCents: inv.paidCents,
      walletBalanceCents,
      refundable
    };
  }
}
