import { ConflictException, Logger } from "@nestjs/common";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  discountCodeRefusal,
  normalizeDiscountCode,
  priceRegistration,
  utcToZonedWallTime,
  type DiscountRule,
  type FamilyPricingRule,
  type RegistrationPrice
} from "@sportspulse/kernel";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Tx | Database;

const log = new Logger("RegistrationDiscounts");

export type DiscountCodeRow = typeof schema.discountCodes.$inferSelect;
type FamilyRow = typeof schema.seasonFamilyPricing.$inferSelect;

/** The kernel rule a stored code applies. */
export function codeRule(c: Pick<DiscountCodeRow, "kind" | "percentBasisPoints" | "amountCents">): DiscountRule {
  return c.kind === "percent"
    ? { kind: "percent", percentBasisPoints: c.percentBasisPoints }
    : { kind: "fixed", amountCents: c.amountCents };
}

/** The season's family pricing as a kernel rule, or null when there is none (or it is off). */
export function familyRule(row: FamilyRow | null | undefined): FamilyPricingRule | null {
  if (!row || !row.isActive) return null;
  const sibling: DiscountRule | null =
    row.siblingKind === "percent"
      ? { kind: "percent", percentBasisPoints: row.siblingPercentBasisPoints }
      : row.siblingKind === "fixed"
        ? { kind: "fixed", amountCents: row.siblingAmountCents }
        : null;
  if (!sibling && row.familyMaxCents === null) return null;
  return { familyMaxCents: row.familyMaxCents, siblingDiscount: sibling, siblingFromNth: row.siblingFromNth };
}

export async function loadFamilyPricing(db: Db, seasonId: string): Promise<FamilyRow | null> {
  const [row] = await db
    .select()
    .from(schema.seasonFamilyPricing)
    .where(eq(schema.seasonFamilyPricing.seasonId, seasonId))
    .limit(1);
  return row ?? null;
}

/** A season's code as typed by a player, or null. Case and spaces never matter. */
export async function findSeasonCode(db: Db, seasonId: string, typed: string): Promise<DiscountCodeRow | null> {
  const code = normalizeDiscountCode(typed);
  if (!code) return null;
  const [row] = await db
    .select()
    .from(schema.discountCodes)
    .where(and(eq(schema.discountCodes.seasonId, seasonId), eq(schema.discountCodes.code, code)))
    .limit(1);
  return row ?? null;
}

/** Today in the season's time zone (YYYY-MM-DD), the day codes' dates are read against. */
export function seasonToday(timeZone: string | null | undefined, now = new Date()): string {
  try {
    return utcToZonedWallTime(now, timeZone || "UTC").slice(0, 10);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * SQL for a registration's family: the account that pays for it.
 *   1. A minor whose guardian confirmed: the guardian's email (REG-15).
 *   2. A person linked to a guardian in family_links: that guardian's email.
 *   3. Otherwise the registrant's own account email.
 * A parent who plays and their children therefore share one family, and
 * so do siblings whose registrations the same guardian consented to.
 */
const familyKeyExpr = (r: string) => sql.raw(`coalesce(
  case when ${r}.metadata->>'parentConsentConfirmedAt' is not null and coalesce(${r}.metadata->>'parentEmail', '') <> ''
       then lower(${r}.metadata->>'parentEmail') end,
  (select lower(pr.email) from family_links fl join profiles pr on pr.id = fl.guardian_user_id
    where fl.minor_person_id = ${r}.subject_person_id and fl.unlinked_at is null
    order by fl.created_at limit 1),
  lower(${r}.metadata->>'email'))`);

export async function familyKeyOf(db: Db, registrationId: string): Promise<string | null> {
  const rows = (await db.execute(
    sql`select ${familyKeyExpr("r")} as k from registrations r where r.id = ${registrationId}::uuid`
  )) as unknown as Array<{ k: string | null }>;
  return rows[0]?.k ?? null;
}

/**
 * What the family already has on the season: registrations still open
 * (not rejected, cancelled or withdrawn) that have a registration invoice
 * that is not void, and what those invoices bill for registration
 * (charges minus discounts; late fees are not part of the family total).
 */
export async function familyPrior(
  db: Db,
  seasonId: string,
  familyKey: string,
  excludeRegistrationId: string
): Promise<{ registrations: number; billedCents: number }> {
  const rows = (await db.execute(sql`
    with fam as (
      select r.id, ${familyKeyExpr("r")} as k
        from registrations r
       where r.season_id = ${seasonId}::uuid
         and r.id <> ${excludeRegistrationId}::uuid
         and r.status not in ('rejected','cancelled','withdrawn')
    )
    select count(distinct i.registration_id)::int as n,
           coalesce(sum(i.subtotal_cents - i.discount_cents), 0)::int as billed
      from fam join invoices i on i.registration_id = fam.id and i.status <> 'void'
     where fam.k = ${familyKey}`)) as unknown as Array<{ n: number; billed: number }>;
  return { registrations: Number(rows[0]?.n ?? 0), billedCents: Number(rows[0]?.billed ?? 0) };
}

export interface RegistrationQuote {
  price: RegistrationPrice;
  familyKey: string | null;
  code: DiscountCodeRow | null;
  /** Set when the stored code can no longer be used; the quote is then priced without it. */
  codeRefusal: { error: string; message: string } | null;
}

/**
 * The price of one registration with its family and code discounts.
 * Used by the funnel's quote (a read) and, inside the pay transaction
 * after the family lock, by the pay step that writes the invoice.
 */
export async function quoteRegistration(
  db: Db,
  input: {
    registrationId: string;
    seasonId: string;
    divisionId: string | null;
    pricingTierId: string | null;
    priceCents: number;
    priceDescription: string;
    currency: string;
    typedCode: string | null;
    timeZone: string | null;
  }
): Promise<RegistrationQuote> {
  const [famRow, familyKey] = await Promise.all([
    loadFamilyPricing(db, input.seasonId),
    familyKeyOf(db, input.registrationId)
  ]);
  const rule = familyRule(famRow);
  const prior = rule && familyKey ? await familyPrior(db, input.seasonId, familyKey, input.registrationId) : null;
  let code: DiscountCodeRow | null = null;
  let codeRefusal: RegistrationQuote["codeRefusal"] = null;
  if (input.typedCode) {
    code = await findSeasonCode(db, input.seasonId, input.typedCode);
    if (!code) {
      codeRefusal = { error: "code_not_found", message: "That code is not valid for this season." };
    } else {
      codeRefusal = discountCodeRefusal(
        code,
        {
          seasonId: input.seasonId,
          divisionId: input.divisionId,
          pricingTierId: input.pricingTierId,
          today: seasonToday(input.timeZone)
        }
      );
    }
    if (codeRefusal) code = null;
  }
  const price = priceRegistration({
    priceCents: input.priceCents,
    priceDescription: input.priceDescription,
    currency: input.currency,
    family: rule && prior ? { rule, priorRegistrations: prior.registrations, priorBilledCents: prior.billedCents } : null,
    code: code ? { code: code.code, rule: codeRule(code) } : null
  });
  return { price, familyKey, code, codeRefusal };
}

/** Serialises pricing for one family in one season until the transaction ends. */
export async function lockFamily(tx: Tx, seasonId: string, familyKey: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`family-pricing:${seasonId}:${familyKey}`}))`);
}

/**
 * Takes one use of a code for a registration, in the pay transaction,
 * before any charge. The guarded UPDATE is the atomic check (same pattern
 * as tier seats), and the (code, registration) unique row makes a retry
 * of the same registration take nothing more.
 */
export async function takeCodeUse(
  tx: Tx,
  input: { codeId: string; registrationId: string; invoiceId: string; personId: string | null; amountCents: number }
): Promise<void> {
  const [already] = await tx
    .select({ id: schema.discountCodeRedemptions.id, status: schema.discountCodeRedemptions.status })
    .from(schema.discountCodeRedemptions)
    .where(
      and(
        eq(schema.discountCodeRedemptions.discountCodeId, input.codeId),
        eq(schema.discountCodeRedemptions.registrationId, input.registrationId)
      )
    )
    .limit(1);
  if (already?.status === "active") {
    log.log(`code use already held code=${input.codeId} registration=${input.registrationId}`);
    return;
  }
  const [taken] = await tx
    .update(schema.discountCodes)
    .set({ usageCount: sql`${schema.discountCodes.usageCount} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(schema.discountCodes.id, input.codeId),
        eq(schema.discountCodes.isActive, true),
        or(isNull(schema.discountCodes.usageLimit), lt(schema.discountCodes.usageCount, schema.discountCodes.usageLimit))
      )
    )
    .returning({ usageCount: schema.discountCodes.usageCount, usageLimit: schema.discountCodes.usageLimit, code: schema.discountCodes.code });
  if (!taken) {
    log.log(`refused code use code=${input.codeId} registration=${input.registrationId}: used up or inactive`);
    throw new ConflictException({
      error: "code_used_up",
      message: "That discount code was just used up. Remove it to pay the full price, or try another code."
    });
  }
  if (already) {
    await tx
      .update(schema.discountCodeRedemptions)
      .set({ status: "active", releasedAt: null, releasedReason: null, invoiceId: input.invoiceId, amountCents: input.amountCents })
      .where(eq(schema.discountCodeRedemptions.id, already.id));
  } else {
    await tx.insert(schema.discountCodeRedemptions).values({
      discountCodeId: input.codeId,
      registrationId: input.registrationId,
      invoiceId: input.invoiceId,
      personId: input.personId,
      amountCents: input.amountCents
    });
  }
  log.log(
    `code use taken code=${taken.code} registration=${input.registrationId} amount=${input.amountCents} now=${taken.usageCount}/${taken.usageLimit ?? "-"}`
  );
}

/** Gives back the code use a registration holds, once. Returns the uses released. */
export async function releaseCodeUses(tx: Db, registrationId: string, why: string): Promise<number> {
  const released = await tx
    .update(schema.discountCodeRedemptions)
    .set({ status: "released", releasedAt: new Date(), releasedReason: why })
    .where(
      and(
        eq(schema.discountCodeRedemptions.registrationId, registrationId),
        eq(schema.discountCodeRedemptions.status, "active")
      )
    )
    .returning({ codeId: schema.discountCodeRedemptions.discountCodeId });
  for (const r of released) {
    await tx
      .update(schema.discountCodes)
      .set({ usageCount: sql`GREATEST(0, ${schema.discountCodes.usageCount} - 1)`, updatedAt: new Date() })
      .where(eq(schema.discountCodes.id, r.codeId));
  }
  if (released.length > 0) log.log(`code uses released registration=${registrationId} count=${released.length} (${why})`);
  return released.length;
}
