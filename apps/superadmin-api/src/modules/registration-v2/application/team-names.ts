import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

/**
 * Team names are unique per organization (teams_org_name_lower_uniq). A
 * team registration names its team; the name decides what approval does:
 *   - no team of that name in the org: approval creates it;
 *   - the org's team of that name, captained by the person registering:
 *     a returning team, re-entered for the new season (same team row);
 *   - a team of that name captained by someone else: refused, before any
 *     payment, in plain words.
 * Before this the approval tried to insert a second team, the unique index
 * refused it, the error was swallowed and the paid registration showed
 * "approved" with no team (season run SMVPCNET9, 26 Oct 2026).
 */
export type TeamNameVerdict =
  | { kind: "new" }
  | { kind: "returning"; teamId: string }
  | { kind: "taken"; message: string };

export async function teamNameVerdict(
  db: Database,
  orgId: string,
  rawName: string,
  userId: string
): Promise<TeamNameVerdict> {
  const name = rawName.trim();
  const [team] = await db
    .select({ id: schema.teams.id, name: schema.teams.name, captainUserId: schema.teams.captainUserId })
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.orgId, orgId),
        sql`lower(${schema.teams.name}) = lower(${name})`,
        isNull(schema.teams.deletedAt)
      )
    )
    .limit(1);
  if (!team) return { kind: "new" };
  if (team.captainUserId === userId) return { kind: "returning", teamId: team.id };
  const [role] = await db
    .select({ id: schema.userRoleAssignments.id })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        eq(schema.roles.code, "captain"),
        eq(schema.userRoleAssignments.scopeType, "team"),
        eq(schema.userRoleAssignments.scopeId, team.id),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    )
    .limit(1);
  if (role) return { kind: "returning", teamId: team.id };
  return {
    kind: "taken",
    message: `A team named "${team.name}" already plays in this organization. Pick another name, or ask its captain to register it.`
  };
}
