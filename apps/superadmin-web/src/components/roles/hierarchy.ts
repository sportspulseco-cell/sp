/**
 * System role hierarchy, top-down. Each level inherits the capabilities
 * of the levels below it, scoped to its own resource.
 *
 * Shared by /roles (list) and /roles/[id] (detail) so the order is
 * defined once.
 */
export const HIERARCHY = [
  "super_admin",
  "org_admin",
  "league_admin",
  "season_admin",
  "division_admin",
  "captain",
  "coach",
  "registrar",
  "referee",
  "scorekeeper",
  "player",
  "parent",
  "spectator"
] as const;

/** 0-based position in the hierarchy; `HIERARCHY.length` when the code is not a hierarchy role. */
export function hierarchyOrder(code: string): number {
  const i = (HIERARCHY as readonly string[]).indexOf(code);
  return i === -1 ? HIERARCHY.length : i;
}
