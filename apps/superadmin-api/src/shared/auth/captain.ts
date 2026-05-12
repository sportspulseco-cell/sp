import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

/**
 * Returns true when the caller can act as captain of `teamId`.
 *
 * Three signals are OR-ed together, in increasing query cost:
 *   1. The legacy `teams.captain_user_id` column points at the user.
 *   2. The user has `is_super_admin = true` on their profile.
 *   3. The user has an active `captain` role assignment scoped to
 *      this exact team in `user_role_assignments`.
 *
 * Signal (3) is the modern IAM path — teams created through the
 * role-grant flow leave `teams.captain_user_id` null, so anything
 * that only checks (1) wrongly 403s the actual captain.
 *
 * Pass `captainUserIdOnRow` when the caller has already loaded the
 * team to skip the extra column read here.
 */
export async function userIsCaptainOfTeam(
  db: Database,
  userId: string,
  teamId: string,
  captainUserIdOnRow?: string | null
): Promise<boolean> {
  let teamCaptainUserId = captainUserIdOnRow;
  if (teamCaptainUserId === undefined) {
    const [team] = await db
      .select({ captainUserId: schema.teams.captainUserId })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    teamCaptainUserId = team?.captainUserId ?? null;
  }
  if (teamCaptainUserId === userId) return true;

  const [profile] = await db
    .select({ isSuper: schema.profiles.isSuperAdmin })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);
  if (profile?.isSuper) return true;

  const [assignment] = await db
    .select({ id: schema.userRoleAssignments.id })
    .from(schema.userRoleAssignments)
    .innerJoin(
      schema.roles,
      eq(schema.roles.id, schema.userRoleAssignments.roleId)
    )
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        eq(schema.userRoleAssignments.scopeType, "team"),
        eq(schema.userRoleAssignments.scopeId, teamId),
        eq(schema.roles.code, "captain"),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    )
    .limit(1);
  return !!assignment;
}
