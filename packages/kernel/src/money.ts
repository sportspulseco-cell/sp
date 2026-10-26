/**
 * Money as people read it: "$59.00". Pinned to en-US so the server and
 * every browser print the same thing. Amounts are integer cents.
 */
export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
  } catch {
    // An unknown currency code still shows the amount.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
