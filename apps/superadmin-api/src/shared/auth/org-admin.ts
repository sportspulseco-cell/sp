import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

/**
 * True when the user holds an active org-scoped `org_admin` (or
 * `super_admin`) assignment on `orgId`. `loadUserScope` alone is not
 * enough: its orgIds also include orgs reached through team or league
 * roles, so a player would pass an orgIds check.
 *
 * Same query the org-admin controllers each carry privately; new code
 * should call this one.
 */
export async function userHasOrgAdminOnOrg(
  db: Database,
  userId: string,
  orgId: string
): Promise<boolean> {
  const rows = await db
    .select({ code: schema.roles.code })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        eq(schema.userRoleAssignments.scopeType, "org"),
        eq(schema.userRoleAssignments.scopeId, orgId),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    );
  return rows.some((r) => ["super_admin", "org_admin"].includes(r.code));
}
