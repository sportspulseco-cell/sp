import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

/**
 * Who hears about a compliance decision on one person (a document
 * decision, COMP-1; an eligibility waiver, COMP-7): the person and the
 * account that acted for them (a guardian for a minor), and the captains
 * of the teams the person is actively rostered on (that season when
 * known). Captains never include the person themselves or anyone already
 * told directly.
 */
export interface ComplianceRecipients {
  direct: Array<{ personId: string; email: string | null }>;
  captains: Array<{ personId: string; email: string | null; teamName: string }>;
}

export async function complianceRecipients(
  db: Database,
  args: { personId: string; actingUserId?: string | null; seasonId: string | null }
): Promise<ComplianceRecipients> {
  const p = schema.persons;
  const direct = await db
    .select({ personId: p.id, email: schema.profiles.email })
    .from(p)
    .leftJoin(schema.profiles, eq(schema.profiles.id, p.userId))
    .where(
      and(
        isNull(p.deletedAt),
        args.actingUserId
          ? or(eq(p.id, args.personId), eq(p.userId, args.actingUserId))!
          : eq(p.id, args.personId)
      )
    );

  const captainRows = await db
    .selectDistinct({
      personId: p.id,
      email: schema.profiles.email,
      teamName: schema.teams.name
    })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMemberships.teamId))
    .innerJoin(
      schema.userRoleAssignments,
      and(
        eq(schema.userRoleAssignments.scopeType, "team"),
        eq(schema.userRoleAssignments.scopeId, schema.teamMemberships.teamId),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    )
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .innerJoin(p, eq(p.userId, schema.userRoleAssignments.userId))
    .leftJoin(schema.profiles, eq(schema.profiles.id, p.userId))
    .where(
      and(
        eq(schema.teamMemberships.personId, args.personId),
        eq(schema.teamMemberships.currentStatus, "active"),
        eq(schema.roles.code, "captain"),
        isNull(p.deletedAt),
        ne(p.id, args.personId),
        ...(args.seasonId ? [eq(schema.teamMemberships.seasonId, args.seasonId)] : [])
      )
    );

  const directIds = new Set(direct.map((d) => d.personId));
  const seen = new Set<string>();
  const captains: ComplianceRecipients["captains"] = [];
  for (const c of captainRows) {
    if (directIds.has(c.personId) || seen.has(c.personId)) continue;
    seen.add(c.personId);
    captains.push({ personId: c.personId, email: c.email ?? null, teamName: c.teamName });
  }
  return {
    direct: direct.map((d) => ({ personId: d.personId, email: d.email ?? null })),
    captains
  };
}
