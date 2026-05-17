/**
 * Shared formatters for the Payment & Invoicing tabs. Money is stored
 * as integer cents on the wire — divide by 100 for display, but apply
 * the per-invoice currency code so non-USD amounts render correctly.
 */

export function fmtMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-CA");
}

export function daysPastDue(dueAt: string | null | undefined): number {
  if (!dueAt) return 0;
  const ms = Date.now() - new Date(dueAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function initials(
  legalFirst: string,
  legalLast: string,
  preferred: string | null
): string {
  const first = (preferred ?? legalFirst).trim();
  const last = legalLast.trim();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "??";
}

export function fullName(
  legalFirst: string,
  legalLast: string,
  preferred: string | null
): string {
  return `${preferred ?? legalFirst} ${legalLast}`.trim();
}
