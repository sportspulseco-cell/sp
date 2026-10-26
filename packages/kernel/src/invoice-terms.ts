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
