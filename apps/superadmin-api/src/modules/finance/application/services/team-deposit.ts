import { Logger } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const log = new Logger("TeamDeposit");

export interface TeamDepositResult {
  entryId: string;
  teamId: string;
  entryStatus: string;
  collectedCents: number;
  thresholdCents: number;
  /** True when this call moved the entry from applied to confirmed. */
  transitioned: boolean;
}

/**
 * Workflow 7A §4.5: a team entry is confirmed once the deposits its
 * players paid reach the entry's threshold. Sums succeeded deposit
 * installments (installment 0) across the sub-invoices of the entry's
 * master invoice, stores the total, and moves applied → confirmed when
 * it is met. Idempotent. Nothing called this before 28 Oct 2026, so a
 * team that paid its deposits stayed "applied" for good.
 */
export async function recomputeTeamDeposit(tx: Tx | Database, entryId: string): Promise<TeamDepositResult | null> {
  const [entry] = await tx
    .select({
      id: schema.divisionTeamEntries.id,
      teamId: schema.divisionTeamEntries.teamId,
      invoiceId: schema.divisionTeamEntries.invoiceId,
      entryStatus: schema.divisionTeamEntries.entryStatus,
      thresholdCents: schema.divisionTeamEntries.confirmationThresholdCents
    })
    .from(schema.divisionTeamEntries)
    .where(eq(schema.divisionTeamEntries.id, entryId))
    .limit(1);
  if (!entry?.invoiceId) return null;

  const subs = await tx
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.parentInvoiceId, entry.invoiceId));
  let collected = 0;
  if (subs.length > 0) {
    const [row] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${schema.installmentSchedules.amountCents}), 0)::int` })
      .from(schema.installmentSchedules)
      .where(
        and(
          inArray(schema.installmentSchedules.invoiceId, subs.map((s) => s.id)),
          eq(schema.installmentSchedules.installmentNumber, 0),
          eq(schema.installmentSchedules.status, "succeeded")
        )
      );
    collected = row?.total ?? 0;
  }

  const transitioned = entry.entryStatus === "applied" && collected >= entry.thresholdCents;
  const entryStatus = transitioned ? "confirmed" : entry.entryStatus;
  await tx
    .update(schema.divisionTeamEntries)
    .set({ collectedCents: collected, entryStatus })
    .where(eq(schema.divisionTeamEntries.id, entry.id));
  log.log(`entry=${entry.id} collected=${collected} threshold=${entry.thresholdCents} status=${entryStatus}${transitioned ? " (confirmed now)" : ""}`);
  return {
    entryId: entry.id,
    teamId: entry.teamId,
    entryStatus,
    collectedCents: collected,
    thresholdCents: entry.thresholdCents,
    transitioned
  };
}

/**
 * After a payment lands on an invoice: when it is a player's share of a
 * team's dues (a sub-invoice of a team entry's master), recompute that
 * entry. Returns null for any other invoice.
 */
export async function recomputeTeamDepositForInvoice(tx: Tx | Database, invoiceId: string): Promise<TeamDepositResult | null> {
  const [inv] = await tx
    .select({ parentInvoiceId: schema.invoices.parentInvoiceId })
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv?.parentInvoiceId) return null;
  const [entry] = await tx
    .select({ id: schema.divisionTeamEntries.id })
    .from(schema.divisionTeamEntries)
    .where(eq(schema.divisionTeamEntries.invoiceId, inv.parentInvoiceId))
    .limit(1);
  return entry ? recomputeTeamDeposit(tx, entry.id) : null;
}
