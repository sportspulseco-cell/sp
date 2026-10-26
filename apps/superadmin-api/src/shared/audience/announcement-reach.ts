import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { permissionGranted } from "@sportspulse/kernel";
import { isSuperAdmin, loadActiveAssignments, rolePermissions } from "../auth/game-access";

/**
 * Where a caller may send an announcement (UC-19), one rule for the
 * compose pickers and the send check, so a picker never offers a target
 * the server refuses.
 *
 * A caller reaches a part of an org through an active role assignment
 * whose role grants `communication.send` (kernel catalogue for system
 * roles: org_admin and league_admin; stored permissions for custom
 * roles):
 *   - super admin, platform scope or org scope: the whole org;
 *   - league scope: that league, its seasons, their divisions and the
 *     teams with an applied or confirmed entry in those divisions;
 *   - season scope: that season and below; division scope: that
 *     division and its teams.
 * Revoked or expired assignments never count (loadActiveAssignments).
 */
export const ANNOUNCE_PERMISSION = "communication.send";

const LIVE_ENTRY_STATUSES = ["applied", "confirmed"];

export interface AnnouncementReach {
  orgId: string;
  /** May send to the whole org (and anything in it). */
  wholeOrg: boolean;
  leagues: Array<{ id: string; name: string }>;
  seasons: Array<{ id: string; name: string; leagueId: string }>;
  divisions: Array<{ id: string; name: string; seasonId: string }>;
  teams: Array<{ id: string; name: string }>;
}

interface Grants {
  everywhere: boolean;
  orgIds: string[];
  leagueIds: string[];
  seasonIds: string[];
  divisionIds: string[];
}

async function announceGrants(db: Database, userId: string): Promise<Grants> {
  if (await isSuperAdmin(db, userId)) {
    return { everywhere: true, orgIds: [], leagueIds: [], seasonIds: [], divisionIds: [] };
  }
  const rows = (await loadActiveAssignments(db, userId)).filter((a) =>
    permissionGranted(rolePermissions(a), ANNOUNCE_PERMISSION)
  );
  const ids = (type: string) =>
    rows.filter((a) => a.scopeType === type && a.scopeId).map((a) => a.scopeId as string);
  return {
    everywhere: rows.some((a) => a.scopeType === "platform"),
    orgIds: ids("org"),
    leagueIds: ids("league"),
    seasonIds: ids("season"),
    divisionIds: ids("division")
  };
}

/**
 * Orgs the caller can announce to at all, with names, for the org
 * picker. Super admins get every active org.
 */
export async function announcementOrgs(
  db: Database,
  userId: string
): Promise<Array<{ id: string; name: string }>> {
  const g = await announceGrants(db, userId);
  const orgIds = new Set<string>(g.orgIds);
  if (!g.everywhere) {
    if (g.leagueIds.length) {
      const rows = await db
        .select({ orgId: schema.leagues.orgId })
        .from(schema.leagues)
        .where(inArray(schema.leagues.id, g.leagueIds));
      for (const r of rows) orgIds.add(r.orgId);
    }
    if (g.seasonIds.length) {
      const rows = await db
        .select({ orgId: schema.seasons.orgId })
        .from(schema.seasons)
        .where(inArray(schema.seasons.id, g.seasonIds));
      for (const r of rows) orgIds.add(r.orgId);
    }
    if (g.divisionIds.length) {
      const rows = await db
        .select({ orgId: schema.seasons.orgId })
        .from(schema.divisions)
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
        .where(inArray(schema.divisions.id, g.divisionIds));
      for (const r of rows) orgIds.add(r.orgId);
    }
    if (orgIds.size === 0) return [];
  }
  const rows = await db
    .select({ id: schema.orgs.id, name: schema.orgs.displayName })
    .from(schema.orgs)
    .where(
      and(
        isNull(schema.orgs.deletedAt),
        g.everywhere ? undefined : inArray(schema.orgs.id, [...orgIds])
      )
    );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** The parts of `orgId` the caller may announce to. Empty when none. */
export async function announcementReach(
  db: Database,
  userId: string,
  orgId: string
): Promise<AnnouncementReach> {
  const g = await announceGrants(db, userId);
  const wholeOrg = g.everywhere || g.orgIds.includes(orgId);

  const leagues = (
    await db
      .select({ id: schema.leagues.id, name: schema.leagues.name })
      .from(schema.leagues)
      .where(and(eq(schema.leagues.orgId, orgId), isNull(schema.leagues.deletedAt)))
  ).filter((l) => wholeOrg || g.leagueIds.includes(l.id));
  const leagueIds = leagues.map((l) => l.id);

  const allSeasons = await db
    .select({ id: schema.seasons.id, name: schema.seasons.name, leagueId: schema.seasons.leagueId })
    .from(schema.seasons)
    .where(and(eq(schema.seasons.orgId, orgId), isNull(schema.seasons.deletedAt)));
  const seasons = wholeOrg
    ? allSeasons
    : allSeasons.filter((s) => leagueIds.includes(s.leagueId) || g.seasonIds.includes(s.id));
  const seasonIds = seasons.map((s) => s.id);

  const allDivisions = allSeasons.length
    ? await db
        .select({ id: schema.divisions.id, name: schema.divisions.name, seasonId: schema.divisions.seasonId })
        .from(schema.divisions)
        .where(
          and(
            inArray(schema.divisions.seasonId, allSeasons.map((s) => s.id)),
            isNull(schema.divisions.deletedAt)
          )
        )
    : [];
  const divisions = wholeOrg
    ? allDivisions
    : allDivisions.filter((d) => seasonIds.includes(d.seasonId) || g.divisionIds.includes(d.id));

  let teams: Array<{ id: string; name: string }>;
  if (wholeOrg) {
    teams = await db
      .select({ id: schema.teams.id, name: schema.teams.name })
      .from(schema.teams)
      .where(and(eq(schema.teams.orgId, orgId), isNull(schema.teams.deletedAt)));
  } else if (divisions.length) {
    teams = await db
      .selectDistinct({ id: schema.teams.id, name: schema.teams.name })
      .from(schema.divisionTeamEntries)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.divisionTeamEntries.teamId))
      .where(
        and(
          inArray(schema.divisionTeamEntries.divisionId, divisions.map((d) => d.id)),
          inArray(schema.divisionTeamEntries.entryStatus, LIVE_ENTRY_STATUSES),
          eq(schema.teams.orgId, orgId),
          isNull(schema.teams.deletedAt)
        )
      );
  } else {
    teams = [];
  }

  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  return {
    orgId,
    wholeOrg,
    leagues: leagues.sort(byName),
    seasons: seasons.sort(byName),
    divisions: divisions.sort(byName),
    teams: teams.sort(byName)
  };
}

/** True when the reach holds the target. Call assertTargetInOrg first. */
export function reachHolds(
  reach: AnnouncementReach,
  type: "org" | "league" | "season" | "division" | "team",
  targetId: string
): boolean {
  if (reach.wholeOrg) return true;
  switch (type) {
    case "org":
      return false;
    case "league":
      return reach.leagues.some((x) => x.id === targetId);
    case "season":
      return reach.seasons.some((x) => x.id === targetId);
    case "division":
      return reach.divisions.some((x) => x.id === targetId);
    case "team":
      return reach.teams.some((x) => x.id === targetId);
  }
}

/** True when the reach holds anything at all. */
export function reachIsEmpty(reach: AnnouncementReach): boolean {
  return (
    !reach.wholeOrg &&
    reach.leagues.length === 0 &&
    reach.seasons.length === 0 &&
    reach.divisions.length === 0 &&
    reach.teams.length === 0
  );
}
