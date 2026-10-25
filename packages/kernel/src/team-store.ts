/**
 * Team store (UC-25, UC-26): what a product offers (sizes, name and
 * number on the back), the order states, and the checks on one order
 * line. Shared by the API, the captain console and the player app.
 * Prices are always the captain's; nothing here sets one.
 */

export const STORE_SIZES = ["YS", "YM", "YL", "S", "M", "L", "XL", "XXL", "3XL"] as const;
export type StoreSize = (typeof STORE_SIZES)[number];

export const STORE_PRODUCT_KINDS = ["jersey", "hoodie", "cap", "custom"] as const;
export type StoreProductKind = (typeof STORE_PRODUCT_KINDS)[number];
export const STORE_KIND_LABELS: Record<StoreProductKind, string> = {
  jersey: "Jersey",
  hoodie: "Hoodie",
  cap: "Cap",
  custom: "Item"
};

export interface StorePersonalization {
  /** Name on the back. */
  name: boolean;
  /** Number on the back. */
  number: boolean;
}

export interface StoreProductOptions {
  kind: StoreProductKind;
  /** Empty: one size. */
  sizes: string[];
  personalization: StorePersonalization;
}

/** What "Generate store from roster" offers; the captain sets each price. */
export const STORE_GENERATE_ITEMS: ReadonlyArray<StoreProductOptions> = [
  { kind: "jersey", sizes: [...STORE_SIZES], personalization: { name: true, number: true } },
  { kind: "hoodie", sizes: ["S", "M", "L", "XL", "XXL"], personalization: { name: true, number: false } },
  { kind: "cap", sizes: [], personalization: { name: false, number: false } }
];

/** Options stored on a product (team_store_products.metadata); a plain product has none. */
export function readStoreProductOptions(metadata: unknown): StoreProductOptions {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const kind = (STORE_PRODUCT_KINDS as readonly string[]).includes(String(m.kind)) ? (m.kind as StoreProductKind) : "custom";
  const sizes = Array.isArray(m.sizes) ? m.sizes.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
  const p = (m.personalization && typeof m.personalization === "object" ? m.personalization : {}) as Record<string, unknown>;
  return { kind, sizes, personalization: { name: p.name === true, number: p.number === true } };
}

export const STORE_ORDER_STATUSES = ["placed", "processing", "shipped", "cancelled"] as const;
export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];
export const STORE_ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  placed: "Placed",
  processing: "Processing",
  shipped: "Shipped",
  cancelled: "Cancelled"
};
/** Placed -> processing -> shipped; an order can be cancelled until it ships. */
export const STORE_ORDER_TRANSITIONS: Record<StoreOrderStatus, readonly StoreOrderStatus[]> = {
  placed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: [],
  cancelled: []
};
export function isStoreOrderStatus(v: unknown): v is StoreOrderStatus {
  return typeof v === "string" && (STORE_ORDER_STATUSES as readonly string[]).includes(v);
}

export const STORE_LINE_MAX_QTY = 10;
export const STORE_NAME_MAX = 16;

export interface StoreOrderLine {
  quantity: number;
  size?: string | null;
  personalName?: string | null;
  personalNumber?: number | null;
}

/** Why this line cannot be ordered, or null. */
export function validateStoreOrderLine(o: StoreProductOptions, line: StoreOrderLine): string | null {
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > STORE_LINE_MAX_QTY) {
    return `Quantity must be 1 to ${STORE_LINE_MAX_QTY}.`;
  }
  const size = line.size?.trim() || null;
  if (o.sizes.length > 0) {
    if (!size) return "Pick a size.";
    if (!o.sizes.includes(size)) return `Size ${size} is not offered. Pick one of ${o.sizes.join(", ")}.`;
  } else if (size) {
    return "This item comes in one size.";
  }
  const name = line.personalName?.trim() || null;
  if (name && !o.personalization.name) return "This item has no name on the back.";
  if (name && name.length > STORE_NAME_MAX) return `The name on the back can be at most ${STORE_NAME_MAX} characters.`;
  if (name && !/^[\p{L}\p{M} .'-]+$/u.test(name)) return "The name on the back can use letters, spaces, apostrophes, dots and hyphens.";
  const num = line.personalNumber ?? null;
  if (num !== null && !o.personalization.number) return "This item has no number on the back.";
  if (num !== null && (!Number.isInteger(num) || num < 0 || num > 99)) return "The number on the back must be 0 to 99.";
  return null;
}

/** "Home jersey · L · #12 SMITH" — the line as the buyer and the captain read it. */
export function storeLineLabel(productName: string, line: StoreOrderLine): string {
  const parts = [productName];
  if (line.size?.trim()) parts.push(line.size.trim());
  const back = [
    line.personalNumber != null ? `#${line.personalNumber}` : null,
    line.personalName?.trim() ? line.personalName.trim().toUpperCase() : null
  ]
    .filter(Boolean)
    .join(" ");
  if (back) parts.push(back);
  const label = parts.join(" · ");
  return line.quantity > 1 ? `${line.quantity} x ${label}` : label;
}
