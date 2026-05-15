import "server-only";
import { cookies } from "next/headers";

/**
 * Cookie key for the org-switcher selection. Set by the
 * `setActiveOrgId` server action (see `./active-org-action.ts`),
 * read by `getActiveOrgId` on every server-rendered page.
 *
 * Falls back to `scope.orgIds[0]` when:
 *   - no cookie is set
 *   - the cookie value is no longer in the caller's scope (org was
 *     removed from their role assignments)
 *
 * Org-switching is admin-self-service — no server-state change beyond
 * the cookie; revoking org access drops the cookie's effect
 * automatically.
 */
const COOKIE_NAME = "sp_active_org";

export async function getActiveOrgId(scope: {
  orgIds: string[];
} | null | undefined): Promise<string | null> {
  if (!scope || scope.orgIds.length === 0) return null;
  const store = await cookies();
  const fromCookie = store.get(COOKIE_NAME)?.value;
  if (fromCookie && scope.orgIds.includes(fromCookie)) {
    return fromCookie;
  }
  return scope.orgIds[0] ?? null;
}

export const ACTIVE_ORG_COOKIE = COOKIE_NAME;
