/**
 * Invoice terms: when an invoice is due. Pure rules shared by the API
 * (registration pay step) and the screens that explain them.
 */

const DAY_MS = 86_400_000;

/** A player paying offline always gets at least this long to pay. */
export const REGISTRATION_FEE_MIN_DAYS_TO_PAY = 14;

/**
 * Due date of a registration fee invoice. The fee is due when the
 * season's registration closes, but never sooner than 14 days after the
 * invoice is issued (a player who registers on the last day still gets
 * two weeks). A payment plan is due no sooner than its last installment,
 * so the overdue sweep never chases a plan that is on schedule.
 */
export function registrationInvoiceDueAt(input: {
  issuedAt: Date;
  registrationClosesAt: Date | null;
  /** Days after issue each plan installment falls due (deposit = 0). */
  planDueInDays?: readonly number[];
}): Date {
  const issued = input.issuedAt.getTime();
  let due = issued + REGISTRATION_FEE_MIN_DAYS_TO_PAY * DAY_MS;
  const closes = input.registrationClosesAt?.getTime();
  if (closes !== undefined && Number.isFinite(closes) && closes > due) due = closes;
  for (const days of input.planDueInDays ?? []) {
    const at = issued + Math.max(0, days) * DAY_MS;
    if (at > due) due = at;
  }
  return new Date(due);
}

export interface PayPlanRow {
  installmentNumber: number;
  amountCents: number;
  status: string;
  dueDate?: string | Date | null;
}

export interface InvoicePayRange {
  /** Least the payer may pay now: the rest of the next installment, else the whole balance. */
  minCents: number;
  /** Most the payer may pay now: the whole balance. */
  maxCents: number;
  /** The next open installment and what is still owed on it, if the invoice has a plan. */
  nextInstallment: { installmentNumber: number; owedCents: number; dueDate: string | Date | null } | null;
}

/**
 * What a payer may pay on an invoice right now. Without a payment plan
 * the whole balance is due. With one, the payer may pay the next
 * installment (what is still owed on it after earlier payments) or any
 * amount up to the whole balance; the plan rows are then settled from
 * the paid amount, earliest first (coveredInstallments). A late fee or
 * other charge beyond the plan is part of the balance once every
 * installment is covered.
 */
export function invoicePayRange(input: { totalCents: number; paidCents: number; installments: readonly PayPlanRow[] }): InvoicePayRange {
  const balance = Math.max(0, input.totalCents - input.paidCents);
  let covered = 0;
  for (const r of [...input.installments].sort((a, b) => a.installmentNumber - b.installmentNumber)) {
    if (r.status === "cancelled") continue;
    covered += Math.max(0, r.amountCents);
    if (covered > input.paidCents) {
      const owed = Math.min(balance, covered - input.paidCents);
      return {
        minCents: owed,
        maxCents: balance,
        nextInstallment: { installmentNumber: r.installmentNumber, owedCents: owed, dueDate: r.dueDate ?? null }
      };
    }
  }
  return { minCents: balance, maxCents: balance, nextInstallment: null };
}

export interface InvoiceLineInput {
  kind: string;
  quantity?: number;
  unitAmountCents: number;
}

/**
 * Totals for invoice lines. Every amount is entered as a positive number;
 * a "discount" line takes its amount off the charges. The total never
 * goes below zero: a discount larger than the charges is refused
 * (ok: false), never silently capped.
 */
export function invoiceLineTotals(lines: readonly InvoiceLineInput[]):
  | { ok: true; chargesCents: number; discountCents: number; totalCents: number }
  | { ok: false; reason: string; chargesCents: number; discountCents: number } {
  let charges = 0;
  let discount = 0;
  for (const l of lines) {
    const amount = Math.round(l.unitAmountCents) * Math.max(1, Math.round(l.quantity ?? 1));
    if (l.kind === "discount") discount += amount;
    else charges += amount;
  }
  if (discount > charges) {
    return { ok: false, reason: "The discount is larger than the charges. An invoice total cannot go below zero.", chargesCents: charges, discountCents: discount };
  }
  return { ok: true, chargesCents: charges, discountCents: discount, totalCents: charges - discount };
}

/**
 * Signed amount of one stored invoice line: discounts are stored as
 * negative amounts so the lines add up to the invoice total.
 */
export function signedLineAmount(kind: string, amountCents: number): number {
  return kind === "discount" ? -Math.abs(amountCents) : amountCents;
}

/** What an invoice is for, in the words a player reads on Payments and the receipt. */
export function invoiceTitle(inv: {
  invoiceType: string;
  registrationId?: string | null;
  metadata?: Record<string, unknown> | null;
  lines?: readonly { kind: string | null; description: string }[];
}): string {
  if (inv.metadata?.kind === "store_order") return "Team store order";
  if (inv.invoiceType === "sub_invoice") return "Team dues share";
  if (inv.invoiceType === "team_dues") return "Team dues";
  if (inv.registrationId) return "Registration";
  const charges = (inv.lines ?? []).filter((l) => l.kind !== "late_fee" && l.kind !== "discount" && l.description.trim());
  if (charges.length === 1) return charges[0]!.description.trim();
  if (charges.length > 1) return `${charges[0]!.description.trim()} and ${charges.length - 1} more`;
  return "Invoice";
}

const LINE_KIND_LABELS: Record<string, string> = {
  registration_fee: "Registration fee",
  jersey: "Jersey",
  equipment: "Equipment",
  late_fee: "Late fee",
  discount: "Discount",
  store_item: "Store item",
  other: "Other"
};

/** Label for one invoice line: its description, else what kind of line it is. */
export function invoiceLineLabel(line: { kind: string | null; description: string | null }): string {
  const d = line.description?.trim();
  if (d) return d;
  return LINE_KIND_LABELS[line.kind ?? ""] ?? "Charge";
}
