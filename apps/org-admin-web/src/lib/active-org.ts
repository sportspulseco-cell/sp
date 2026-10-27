import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

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

/**
 * Gate a record page on the active org. A record in another org the
 * caller also manages switches the active org and reopens `path`
 * (a link from an email or a colleague used to 404 for anyone running
 * two orgs). A record outside the caller's orgs stays a 404, so its
 * existence never leaks.
 */
export async function openInActiveOrg(
  scope: { orgIds: string[] } | null | undefined,
  recordOrgId: string | null | undefined,
  path: string
): Promise<void> {
  if (!recordOrgId) return;
  const active = await getActiveOrgId(scope);
  if (!active || active === recordOrgId) return;
  if (scope?.orgIds.includes(recordOrgId)) {
    redirect(`/switch-org?org=${encodeURIComponent(recordOrgId)}&next=${encodeURIComponent(path)}`);
  }
  notFound();
}
