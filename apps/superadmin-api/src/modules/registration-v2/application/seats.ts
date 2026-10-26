import { ConflictException, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { releaseCodeUses } from "./discounts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const log = new Logger("TierSeats");

/**
 * Seats on a price with a usage limit (an early-bird price for the first
 * 50 players). A registration takes its seat in the pay transaction,
 * before any charge, and gives it back when it is rejected or cancelled.
 * Before this the limit was saved and shown ("0/50 taken") but never
 * counted or enforced.
 */
export async function takeSeat(tx: Tx, tierId: string, registrationId: string): Promise<void> {
  const [taken] = await tx
    .update(schema.pricingTiers)
    .set({ usageCount: sql`${schema.pricingTiers.usageCount} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(schema.pricingTiers.id, tierId),
        or(isNull(schema.pricingTiers.usageLimit), lt(schema.pricingTiers.usageCount, schema.pricingTiers.usageLimit))
      )
    )
    .returning({ usageCount: schema.pricingTiers.usageCount, usageLimit: schema.pricingTiers.usageLimit });
  if (taken) {
    log.log(`seat taken tier=${tierId} registration=${registrationId} now=${taken.usageCount}/${taken.usageLimit ?? "-"}`);
    return;
  }
  const [t] = await tx
    .select({ usageCount: schema.pricingTiers.usageCount, usageLimit: schema.pricingTiers.usageLimit })
    .from(schema.pricingTiers)
    .where(eq(schema.pricingTiers.id, tierId))
    .limit(1);
  log.log(`refused seat tier=${tierId} registration=${registrationId}: full ${t?.usageCount}/${t?.usageLimit}`);
  throw new ConflictException({
    error: "tier_full",
    message: `This price is full: ${t?.usageCount ?? 0} of ${t?.usageLimit ?? 0} taken. Go back to the price step and pick another.`
  });
}

/** Gives back the seat a registration took at payment, once. */
export async function releaseSeat(
  tx: Tx | Database,
  registration: { id: string; metadata: unknown }
): Promise<boolean> {
  const meta = (registration.metadata as Record<string, unknown> | null) ?? {};
  const seat = meta.seat as { tierId?: string; releasedAt?: string } | undefined;
  if (!seat?.tierId || seat.releasedAt) return false;
  await tx
    .update(schema.pricingTiers)
    .set({ usageCount: sql`GREATEST(0, ${schema.pricingTiers.usageCount} - 1)`, updatedAt: new Date() })
    .where(eq(schema.pricingTiers.id, seat.tierId));
  await tx
    .update(schema.registrations)
    .set({
      metadata: sql`jsonb_set(${schema.registrations.metadata}, '{seat,releasedAt}', to_jsonb(${new Date().toISOString()}::text))`,
      updatedAt: new Date()
    })
    .where(eq(schema.registrations.id, registration.id));
  log.log(`seat released tier=${seat.tierId} registration=${registration.id}`);
  return true;
}

/**
 * What closing a registration (rejected or cancelled) does to its money:
 * the seat on a limited price goes back, a discount code use goes back
 * (the code counts one use fewer), and an invoice nothing was paid
 * on is voided, so Finance stops counting it as owed and overdue
 * reminders stop. A paid invoice stays as it is; the admin refunds it
 * from the invoice. Run in the transaction that closes the registration.
 */
export async function closeRegistrationMoney(
  tx: Tx,
  registration: { id: string; metadata: unknown },
  why: string
): Promise<void> {
  await releaseSeat(tx, registration);
  await releaseCodeUses(tx, registration.id, why);
  const voided = await tx
    .update(schema.invoices)
    .set({
      status: "void",
      notes: sql`COALESCE(${schema.invoices.notes} || E'\n', '') || ${why}`,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(schema.invoices.registrationId, registration.id),
        eq(schema.invoices.paidCents, 0),
        inArray(schema.invoices.status, ["draft", "sent", "overdue"])
      )
    )
    .returning({ id: schema.invoices.id });
  log.log(`closed registration=${registration.id} (${why}): unpaid invoices voided=${voided.length}`);
}
