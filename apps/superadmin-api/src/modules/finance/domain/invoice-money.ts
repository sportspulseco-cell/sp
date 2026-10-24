/**
 * Pure invoice money rules. No I/O: callers read the rows (under a row
 * lock when they write) and pass the numbers in.
 *
 * Model (MON-9):
 *   - payments.amount_cents (status 'succeeded', method != 'refund') is
 *     money received for the invoice.
 *   - refunds.amount_cents is money given back. A refund also settles
 *     that part of the bill: the refund command lowers BOTH
 *     invoices.total_cents and invoices.paid_cents by the amount, so
 *     "outstanding = total - paid" stays what it was. A refunded player
 *     is never chased again for the refunded money by the overdue sweep.
 *   - Refund rows written by the refund command carry
 *     metadata.invoiceAdjusted = true. Older rows (written before this
 *     rule) never touched the invoice and are subtracted from the
 *     refundable amount instead.
 */

export type InvoiceMoneyStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "void";

/**
 * Status implied by the money on an invoice. Draft and void are admin
 * decisions and never change here. Overdue stays overdue while a
 * balance remains (only the sweep or a due-date extension moves it).
 */
export function statusForMoney(input: {
  status: string;
  totalCents: number;
  paidCents: number;
}): InvoiceMoneyStatus {
  const s = input.status as InvoiceMoneyStatus;
  if (s === "draft" || s === "void") return s;
  if (input.paidCents >= input.totalCents) return "paid";
  if (s === "overdue") return "overdue";
  return input.paidCents > 0 ? "partial" : "sent";
}

/**
 * Most that can still be refunded on an invoice: what it currently shows
 * as paid, minus older refunds that were recorded without adjusting it.
 */
export function refundableCents(input: {
  paidCents: number;
  unadjustedRefundCents: number;
}): number {
  return Math.max(0, input.paidCents - input.unadjustedRefundCents);
}

/** Card money that can go back to a card: card charges minus card refunds. */
export function cardRefundableCents(input: {
  cardPaidCents: number;
  cardRefundedCents: number;
}): number {
  return Math.max(0, input.cardPaidCents - input.cardRefundedCents);
}
