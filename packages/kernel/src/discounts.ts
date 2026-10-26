/**
 * Registration discounts: discount codes, sibling discounts and the
 * family maximum. Pure rules, no I/O. The API prices a registration with
 * priceRegistration at the pay step (never trusting a client total), the
 * funnel shows the same lines from the server's quote, and the admin
 * screens validate with the same checks.
 *
 * Order (as SportsEngine applies them): the price, then the sibling
 * discount for a family's 2nd and later players, then a discount code,
 * then the family maximum caps what the family pays in the season.
 * Every discount is a positive amount on a "discount" invoice line that
 * takes it off the charges; no line ever takes the total below zero.
 */

import { formatMoney } from "./money";

export const DISCOUNT_KINDS = ["percent", "fixed"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** Largest amount any rule accepts: $10,000,000.00, well inside int4. */
export const MAX_DISCOUNT_CENTS = 1_000_000_000;

export interface DiscountRule {
  kind: DiscountKind;
  /** percent: 1..10000 basis points (100 = 1%, 10000 = 100%). */
  percentBasisPoints?: number | null;
  /** fixed: 1..MAX_DISCOUNT_CENTS cents. */
  amountCents?: number | null;
}

/** Why a rule cannot be saved, in words an admin reads; null when it is fine. */
export function discountRuleProblem(rule: DiscountRule): string | null {
  if (rule.kind === "percent") {
    const bp = rule.percentBasisPoints;
    if (bp == null || !Number.isInteger(bp)) return "Enter the percent off.";
    if (bp <= 0) return "The percent off must be more than 0.";
    if (bp > 10_000) return "The percent off cannot be more than 100%.";
    return null;
  }
  if (rule.kind === "fixed") {
    const c = rule.amountCents;
    if (c == null || !Number.isInteger(c)) return "Enter the amount off.";
    if (c <= 0) return "The amount off must be more than $0.00.";
    if (c > MAX_DISCOUNT_CENTS) return "The amount off is too large.";
    return null;
  }
  return "Choose percent or fixed amount.";
}

/**
 * What a rule takes off a price, in cents: never below zero and never
 * more than the price. A percent rounds to the nearest cent (half up).
 * An invalid rule takes nothing off.
 */
export function discountAmountCents(rule: DiscountRule | null | undefined, baseCents: number): number {
  const base = Math.max(0, Math.round(Number.isFinite(baseCents) ? baseCents : 0));
  if (!rule || base === 0 || discountRuleProblem(rule)) return 0;
  const off =
    rule.kind === "percent"
      ? Math.round((base * rule.percentBasisPoints!) / 10_000)
      : rule.amountCents!;
  return Math.min(base, Math.max(0, off));
}

/** "10% off" / "$25.00 off" for lists and invoice lines. */
export function discountRuleLabel(rule: DiscountRule, currency = "USD"): string {
  if (rule.kind === "percent") {
    const pct = (rule.percentBasisPoints ?? 0) / 100;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}% off`;
  }
  return `${formatMoney(rule.amountCents ?? 0, currency)} off`;
}

// ---------------------------------------------------------------------
// Discount codes
// ---------------------------------------------------------------------

/**
 * The stored form of a code a person typed: no spaces anywhere, upper
 * case. " spring 10 " and "SPRING10" are the same code.
 */
export function normalizeDiscountCode(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** A code an admin may create: 3 to 32 letters, digits, - or _, starting with a letter or digit. */
export function discountCodeTextProblem(code: string): string | null {
  if (code.length < 3) return "A code needs at least 3 characters.";
  if (code.length > 32) return "A code can have at most 32 characters.";
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return "Use letters, digits, - and _ only.";
  return null;
}

export interface DiscountCodeTerms {
  seasonId: string;
  isActive: boolean;
  /** First day the code works (YYYY-MM-DD, the season's calendar), or none. */
  validFrom: string | null;
  /** Last day the code works (inclusive), or none. */
  validTo: string | null;
  usageLimit: number | null;
  usageCount: number;
  /** Empty: every division. */
  divisionIds: readonly string[];
  /** Empty: every price. */
  pricingTierIds: readonly string[];
}

export type DiscountCodeRefusal =
  | "code_inactive"
  | "code_wrong_season"
  | "code_not_started"
  | "code_expired"
  | "code_used_up"
  | "code_wrong_division"
  | "code_wrong_price";

/**
 * Why this code cannot be used on this registration, or null when it
 * can. `today` is the date in the season's time zone (YYYY-MM-DD).
 * The used-up check here is a read; the API takes the use atomically
 * when the invoice is written, so the last use cannot be taken twice.
 */
export function discountCodeRefusal(
  code: DiscountCodeTerms,
  ctx: { seasonId: string; divisionId: string | null; pricingTierId: string | null; today: string }
): { error: DiscountCodeRefusal; message: string } | null {
  if (code.seasonId !== ctx.seasonId) {
    return { error: "code_wrong_season", message: "That code is not for this season." };
  }
  if (!code.isActive) return { error: "code_inactive", message: "That code is no longer active." };
  if (code.validFrom && ctx.today < code.validFrom) {
    return { error: "code_not_started", message: `That code works from ${code.validFrom}.` };
  }
  if (code.validTo && ctx.today > code.validTo) {
    return { error: "code_expired", message: `That code expired on ${code.validTo}.` };
  }
  if (code.usageLimit !== null && code.usageCount >= code.usageLimit) {
    return { error: "code_used_up", message: "That code has been used the most times it allows." };
  }
  if (code.divisionIds.length > 0 && (!ctx.divisionId || !code.divisionIds.includes(ctx.divisionId))) {
    return { error: "code_wrong_division", message: "That code is not for your division." };
  }
  if (code.pricingTierIds.length > 0 && (!ctx.pricingTierId || !code.pricingTierIds.includes(ctx.pricingTierId))) {
    return { error: "code_wrong_price", message: "That code is not for the price you picked." };
  }
  return null;
}

// ---------------------------------------------------------------------
// Family pricing
// ---------------------------------------------------------------------

export interface FamilyPricingRule {
  /** Most one family pays for registrations in the season; null: no maximum. */
  familyMaxCents: number | null;
  /** Off each registration from `siblingFromNth` on; null: none. */
  siblingDiscount: DiscountRule | null;
  /** The first registration that gets the sibling discount (2 = the second). */
  siblingFromNth: number;
}

/** Why a family rule cannot be saved; null when it is fine. */
export function familyPricingProblem(rule: FamilyPricingRule): string | null {
  if (rule.familyMaxCents !== null) {
    if (!Number.isInteger(rule.familyMaxCents) || rule.familyMaxCents < 0) return "The family maximum must be $0.00 or more.";
    if (rule.familyMaxCents > MAX_DISCOUNT_CENTS) return "The family maximum is too large.";
  }
  if (!Number.isInteger(rule.siblingFromNth) || rule.siblingFromNth < 2 || rule.siblingFromNth > 20) {
    return "The sibling discount starts with the 2nd to the 20th player.";
  }
  if (rule.siblingDiscount) return discountRuleProblem(rule.siblingDiscount);
  if (rule.familyMaxCents === null) return "Set a family maximum, a sibling discount, or both.";
  return null;
}

/**
 * What the family maximum takes off this registration: whatever would
 * take the family's season total past the maximum, never more than this
 * registration costs.
 */
export function familyCapCents(familyMaxCents: number | null, priorFamilyCents: number, thisCents: number): number {
  const self = Math.max(0, Math.round(thisCents));
  if (familyMaxCents === null || self === 0) return 0;
  const prior = Math.max(0, Math.round(priorFamilyCents));
  const over = prior + self - Math.max(0, Math.round(familyMaxCents));
  return Math.min(self, Math.max(0, over));
}

// ---------------------------------------------------------------------
// One registration's price
// ---------------------------------------------------------------------

export type PriceLineSource = "price" | "sibling" | "code" | "family_max";

export interface PriceLine {
  kind: "registration_fee" | "discount";
  source: PriceLineSource;
  description: string;
  /** Always positive; a discount line takes it off. */
  amountCents: number;
}

export interface RegistrationPrice {
  lines: PriceLine[];
  chargesCents: number;
  discountCents: number;
  totalCents: number;
  siblingCents: number;
  codeCents: number;
  familyMaxCents: number;
  /** Where this registration falls in the family (1 = first). */
  familyPosition: number;
}

export function priceRegistration(input: {
  priceCents: number;
  priceDescription: string;
  currency?: string;
  family?: { rule: FamilyPricingRule; priorRegistrations: number; priorBilledCents: number } | null;
  code?: { code: string; rule: DiscountRule } | null;
}): RegistrationPrice {
  const price = Math.max(0, Math.round(Number.isFinite(input.priceCents) ? input.priceCents : 0));
  const currency = input.currency ?? "USD";
  const lines: PriceLine[] = [
    { kind: "registration_fee", source: "price", description: input.priceDescription, amountCents: price }
  ];
  let running = price;
  const position = Math.max(0, Math.floor(input.family?.priorRegistrations ?? 0)) + 1;

  let siblingCents = 0;
  const fam = input.family?.rule ?? null;
  if (fam?.siblingDiscount && position >= fam.siblingFromNth) {
    siblingCents = discountAmountCents(fam.siblingDiscount, running);
    if (siblingCents > 0) {
      running -= siblingCents;
      lines.push({
        kind: "discount",
        source: "sibling",
        description: `Sibling discount (${ordinal(position)} player, ${discountRuleLabel(fam.siblingDiscount, currency)})`,
        amountCents: siblingCents
      });
    }
  }

  let codeCents = 0;
  if (input.code) {
    codeCents = discountAmountCents(input.code.rule, running);
    if (codeCents > 0) {
      running -= codeCents;
      lines.push({
        kind: "discount",
        source: "code",
        description: `Discount code ${input.code.code} (${discountRuleLabel(input.code.rule, currency)})`,
        amountCents: codeCents
      });
    }
  }

  let capCents = 0;
  if (fam && fam.familyMaxCents !== null) {
    capCents = familyCapCents(fam.familyMaxCents, input.family?.priorBilledCents ?? 0, running);
    if (capCents > 0) {
      running -= capCents;
      lines.push({
        kind: "discount",
        source: "family_max",
        description: `Family maximum reached (${formatMoney(fam.familyMaxCents, currency)} a season)`,
        amountCents: capCents
      });
    }
  }

  const discountCents = siblingCents + codeCents + capCents;
  return {
    lines,
    chargesCents: price,
    discountCents,
    totalCents: price - discountCents,
    siblingCents,
    codeCents,
    familyMaxCents: capCents,
    familyPosition: position
  };
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

