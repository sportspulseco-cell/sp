import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { UserScope } from "./scope";
import { personVisible } from "./visibility";
import { accessCan, accessForAnyScope, type GameScopeShape } from "./game-access";

/**
 * Who may act on one person's discipline record (COMP-10).
 *
 * A person carries no scope of their own; they sit inside the scopes of
 * the teams they have played for. A caller may act when one of their
 * role assignments covers one of those team-seasons (org, league,
 * season or team scope, same covering rule as games) and grants the
 * permission. Every roster spot counts, released ones included, because
 * a suspension carries across teams and seasons (benchmark C R14).
 *
 * Contract: a person the caller cannot see is a 404; a visible person
 * the caller may not act on is a 403 in plain words.
 */
export async function personScopeShapes(
  db: Pick<Database, "selectDistinct">,
  personId: string
): Promise<GameScopeShape[]> {
  const rows = await db
    .selectDistinct({
      teamId: schema.teamMemberships.teamId,
      seasonId: schema.teamMemberships.seasonId,
      leagueId: schema.seasons.leagueId,
      orgId: schema.seasons.orgId
    })
    .from(schema.teamMemberships)
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teamMemberships.seasonId))
    .where(eq(schema.teamMemberships.personId, personId));
  return rows.map((r) => ({
    id: "",
    orgId: r.orgId,
    leagueId: r.leagueId,
    seasonId: r.seasonId,
    divisionId: null,
    homeTeamId: r.teamId,
    awayTeamId: r.teamId
  }));
}

/** The subset of `permissions` the caller holds over this person. */
export async function personPermissions(
  db: Database,
  userId: string,
  personId: string,
  permissions: readonly string[]
): Promise<string[]> {
  const access = await accessForAnyScope(db, userId, await personScopeShapes(db, personId));
  return permissions.filter((p) => accessCan(access, p));
}

export async function requirePersonPermission(
  db: Database,
  userId: string,
  scope: UserScope,
  personId: string,
  permission: string,
  action: string
): Promise<void> {
  if (!(await personVisible(db, { scope, userId }, personId))) {
    throw new NotFoundException(`Person not found: ${personId}`);
  }
  const [held] = await personPermissions(db, userId, personId, [permission]);
  if (!held) {
    throw new ForbiddenException(
      `Your role cannot ${action} for this player. Ask your league admin.`
    );
  }
}
