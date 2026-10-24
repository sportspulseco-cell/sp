import { BadRequestException, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

/**
 * "Who is in this part of the org" — one implementation for every caller
 * that fans out over an org target: bulk invoices (InvoicingService), the
 * org-admin invoice proxy and the league announcement (UC-19).
 *
 * A target is the whole org, or one league / season / division / team of
 * it. Teams count for a league, season or division when they hold an
 * applied or confirmed division entry under it; for the whole org every
 * team the org owns counts.
 */
export type OrgTargetType = "org" | "league" | "season" | "division" | "team";

export const ORG_TARGET_TYPES: OrgTargetType[] = [
  "org",
  "league",
  "season",
  "division",
  "team"
];

/** Division entries that put a team "in" a division for fan-out purposes. */
const LIVE_ENTRY_STATUSES = ["applied", "confirmed"];

/**
 * 404 unless the target belongs to `orgId`. Never leaks whether the id
 * exists in another org. `org` targets are the org itself.
 */
export async function assertTargetInOrg(
  db: Database,
  type: string,
  targetId: string,
  orgId: string
): Promise<void> {
  if (type === "org") {
    if (targetId !== orgId) throw new NotFoundException("Target not found in org");
    return;
  }
  let rows: Array<{ orgId: string }>;
  if (type === "team") {
    rows = await db
      .select({ orgId: schema.teams.orgId })
      .from(schema.teams)
      .where(eq(schema.teams.id, targetId))
      .limit(1);
  } else if (type === "league") {
    rows = await db
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, targetId))
      .limit(1);
  } else if (type === "season") {
    rows = await db
      .select({ orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, targetId))
      .limit(1);
  } else if (type === "division") {
    rows = await db
      .select({ orgId: schema.seasons.orgId })
      .from(schema.divisions)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(eq(schema.divisions.id, targetId))
      .limit(1);
  } else {
    throw new BadRequestException(`Unknown target type: ${type}`);
  }
  if (rows[0]?.orgId !== orgId) {
    throw new NotFoundException("Target not found in org");
  }
}

/** Team ids that fall under a target. Call assertTargetInOrg first. */
export async function teamIdsInTarget(
  db: Database,
  type: OrgTargetType,
  targetId: string,
  orgId: string
): Promise<string[]> {
  if (type === "team") return [targetId];
  if (type === "org") {
    const rows = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.orgId, orgId));
    return rows.map((r) => r.id);
  }
  const base = db
    .selectDistinct({ teamId: schema.divisionTeamEntries.teamId })
    .from(schema.divisionTeamEntries)
    .innerJoin(
      schema.divisions,
      eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
    )
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId));
  const where =
    type === "division"
      ? eq(schema.divisionTeamEntries.divisionId, targetId)
      : type === "season"
        ? eq(schema.divisions.seasonId, targetId)
        : eq(schema.seasons.leagueId, targetId);
  const rows = await base.where(
    and(where, inArray(schema.divisionTeamEntries.entryStatus, LIVE_ENTRY_STATUSES))
  );
  return rows.map((r) => r.teamId);
}

/** Distinct person ids with an active membership on any of the teams. */
export async function activeMemberPersonIds(
  db: Database,
  teamIds: string[]
): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ personId: schema.teamMemberships.personId })
    .from(schema.teamMemberships)
    .where(
      and(
        inArray(schema.teamMemberships.teamId, teamIds),
        eq(schema.teamMemberships.currentStatus, "active")
      )
    );
  return rows.map((r) => r.personId);
}
