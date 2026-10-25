/**
 * Money as people read it: "$59.00". Pinned to en-US so the server and
 * every browser print the same thing. Amounts are integer cents.
 */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
