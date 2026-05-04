/** Format minor units (cents) as a currency string. */
export function formatMoney(
  cents: number,
  currency: string = "USD",
  opts: { sign?: boolean } = {}
): string {
  const amount = cents / 100;
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    signDisplay: opts.sign ? "exceptZero" : "auto"
  });
  return formatter.format(amount);
}
