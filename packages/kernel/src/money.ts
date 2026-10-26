/**
 * Money as people read it: "$59.00". Pinned to en-US so the server and
 * every browser print the same thing. Amounts are integer cents.
 * `sign: true` prints "+$5.00" and "-$5.00" (credits and debits); zero
 * never carries a sign.
 */
export function formatMoney(cents: number, currency = "USD", opts: { sign?: boolean } = {}): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      signDisplay: opts.sign ? "exceptZero" : "auto"
    }).format(cents / 100);
  } catch {
    // An unknown currency code still shows the amount.
    const sign = opts.sign && cents > 0 ? "+" : cents < 0 ? "-" : "";
    return `${sign}${(Math.abs(cents) / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Cents as the plain number an amount field starts with: 5900 is "59.00".
 * No currency symbol and no thousands separator, so the field parses back.
 */
export function centsToAmountInput(cents: number): string {
  if (!Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}
