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

/** Role codes that administer people (see SYSTEM_ROLES in @sportspulse/kernel). */
const PEOPLE_ADMIN_ROLES = [
  "super_admin",
  "org_admin",
  "league_admin",
  "season_admin",
  "division_admin",
  "registrar"
];

/**
 * True for super admins (profile flag) and holders of an active admin
 * role at any scope. Used to decide whether a caller may see personal
 * details (DOB, gender, account links) beyond a name.
 */
export async function userIsPeopleAdmin(db: Database, userId: string): Promise<boolean> {
  const [profile] = await db
    .select({ isSuper: schema.profiles.isSuperAdmin })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);
  if (profile?.isSuper) return true;
  const rows = await db
    .select({ code: schema.roles.code })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    );
  return rows.some((r) => PEOPLE_ADMIN_ROLES.includes(r.code));
}
