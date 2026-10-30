/**
 * The reference a player quotes for a registration, e.g. "OS1-2026-491B9381":
 * the season's initials, the season's start year, then the first 8 characters
 * of the registration id. One rule for the sign-up confirmation and the
 * player's My registrations pages, which showed a bare id fragment
 * ("Ref 2d3fdb53") that read like a database code (PPHL, 30 Oct 2026).
 */
export function registrationReference(input: {
  id: string;
  seasonName?: string | null;
  seasonStartDate?: string | null;
}): string {
  const initials = (input.seasonName ?? "")
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("")
    .slice(0, 4);
  const year = (input.seasonStartDate ?? "").slice(0, 4);
  return [initials || "REG", year, input.id.slice(0, 8).toUpperCase()].filter(Boolean).join("-");
}
