/** Recruiting is mediated by offers. Never expose contact data or arbitrary
 * profile metadata/free text to a captain just because they can browse a pool. */
export function captainPoolView<T extends {
  playerEmail: string | null; playerDob: string | null;
  metadata: Record<string, unknown>; note: string | null;
}>(entry: T): T {
  return { ...entry, playerEmail: null, playerDob: null, metadata: {}, note: null };
}
