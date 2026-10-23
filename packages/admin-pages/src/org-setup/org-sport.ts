/**
 * The sport each org already plays, from its leagues (most common wins).
 * Forms default their Sport picker from this instead of the
 * alphabetically first sport, which put "Australian Rules Football" on
 * every hockey org's new league and team (SETUP-3). Orgs with no
 * leagues get no entry, so the picker starts empty.
 */
export function sportByOrg(
  leagues: ReadonlyArray<{ orgId: string; sportCode: string }>
): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const l of leagues) {
    if (!l.sportCode) continue;
    const perOrg = counts.get(l.orgId) ?? new Map<string, number>();
    perOrg.set(l.sportCode, (perOrg.get(l.sportCode) ?? 0) + 1);
    counts.set(l.orgId, perOrg);
  }
  const out: Record<string, string> = {};
  for (const [orgId, perOrg] of counts) {
    out[orgId] = [...perOrg.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
  return out;
}
