/**
 * The name people read for a sport code ("HOCKEY_ICE" → "Ice hockey").
 * Lists used to print the raw code. Mirrors the `sports` table (28 Oct
 * 2026); a code added there later still reads as words until it is
 * added here.
 */
export const SPORT_LABELS: Record<string, string> = {
  AFL: "Australian rules football",
  BASEBALL: "Baseball",
  BASKETBALL: "Basketball",
  CRICKET: "Cricket",
  FUTSAL: "Futsal",
  HANDBALL: "Handball",
  HOCKEY_FIELD: "Field hockey",
  HOCKEY_ICE: "Ice hockey",
  LACROSSE: "Lacrosse",
  NETBALL: "Netball",
  RUGBY_LEAGUE: "Rugby league",
  RUGBY_UNION: "Rugby union",
  SOCCER: "Soccer",
  VOLLEYBALL: "Volleyball"
};

export function sportLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const known = SPORT_LABELS[code.toUpperCase()];
  if (known) return known;
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
