import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { and, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  SYSTEM_ROLE_BY_CODE,
  gameOfficialPermissions,
  permissionGranted
} from "@sportspulse/kernel";
import type { UserScope } from "./scope";

/**
 * Who may read and operate one game (SCH-12).
 *
 * A role assignment covers a game when its scope contains the game:
 * platform; the league's org; the league; the game's season (games.season_id
 * or its division's season); the division; the game itself; or, for reads
 * only, one of the two teams. The permissions of every covering assignment
 * are pooled and checked with the kernel's wildcard rule
 * (`permissionGranted`). System roles take their permissions from the
 * kernel catalogue (`SYSTEM_ROLES`), which is canonical; the seeded
 * `roles.permissions` copy is insert-only and drifts. Custom roles use
 * their stored `roles.permissions`.
 *
 * Unlike `loadUserScope`, this reads season- and game-scoped assignments,
 * so a scorekeeper assigned to one season or one game can run exactly
 * those games. It never widens list visibility elsewhere.
 *
 * Contract for handlers: a game the caller cannot see is a 404 (never leak
 * existence); a visible game the caller may not operate is a 403 in plain
 * words.
 */

export interface GameScopeRef {
  id: string;
  orgId: string;
  leagueId: string;
  seasonId: string | null;
  divisionId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  publishedAt: Date | null;
  scheduleRunId: string | null;
}

export interface ActiveAssignment {
  scopeType: string;
  scopeId: string | null;
  roleCode: string;
  isSystem: boolean;
  rolePermissions: unknown;
}

export interface GameAccess {
  game: GameScopeRef;
  superAdmin: boolean;
  /** Raw permission strings (may hold wildcards) of every covering assignment. */
  granted: string[];
  /** True when at least one active assignment covers the game. */
  covered: boolean;
}

/** Permissions that let a caller see a game before it is published. */
export const DRAFT_VIEW_PERMISSIONS = ["game.read", "scheduler.run", "scheduler.publish"];

/** Game actions the admin game page shows or hides per viewer. */
export const GAME_ACTION_PERMISSIONS = [
  "game.start",
  "score.write",
  "game_event.write",
  "game.finalize",
  "game.postpone",
  "game.cancel",
  "game.forfeit",
  "game.reschedule",
  "game.publish",
  "game.assign_officials",
  "stats.recompute",
  // Discipline from the scoresheet (COMP-10): suspend from a penalty, lift.
  "suspension.issue",
  "suspension.lift"
] as const;

export async function isSuperAdmin(db: Database, userId: string): Promise<boolean> {
  const [p] = await db
    .select({ s: schema.profiles.isSuperAdmin })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);
  return !!p?.s;
}

export async function loadActiveAssignments(db: Database, userId: string): Promise<ActiveAssignment[]> {
  return db
    .select({
      scopeType: schema.userRoleAssignments.scopeType,
      scopeId: schema.userRoleAssignments.scopeId,
      roleCode: schema.roles.code,
      isSystem: schema.roles.isSystem,
      rolePermissions: schema.roles.permissions
    })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        isNull(schema.userRoleAssignments.revokedAt),
        or(
          isNull(schema.userRoleAssignments.effectiveTo),
          gt(schema.userRoleAssignments.effectiveTo, new Date())
        )
      )
    );
}

export function rolePermissions(a: ActiveAssignment): string[] {
  if (a.isSystem) {
    const def = SYSTEM_ROLE_BY_CODE[a.roleCode];
    if (def) return def.defaultPermissions;
  }
  return Array.isArray(a.rolePermissions)
    ? a.rolePermissions.filter((p): p is string => typeof p === "string")
    : [];
}

/**
 * The caller's live crew assignments from the game's Officials panel
 * (game_officials rows on the caller's person). A row is a grant on that
 * one game (kernel `gameOfficialPermissions`): assigning someone as
 * scorekeeper lets them run that game's scoresheet. Declined and revoked
 * rows grant nothing.
 */
export async function loadOfficialAssignments(
  db: Pick<Database, "select">,
  userId: string,
  gameIds?: string[]
): Promise<Array<{ gameId: string; role: string; status: string }>> {
  if (gameIds && gameIds.length === 0) return [];
  return db
    .select({
      gameId: schema.gameOfficials.gameId,
      role: schema.gameOfficials.role,
      status: schema.gameOfficials.status
    })
    .from(schema.gameOfficials)
    .innerJoin(schema.persons, eq(schema.persons.id, schema.gameOfficials.personId))
    .where(
      and(
        eq(schema.persons.userId, userId),
        isNull(schema.gameOfficials.revokedAt),
        ne(schema.gameOfficials.status, "declined"),
        ...(gameIds ? [inArray(schema.gameOfficials.gameId, gameIds)] : [])
      )
    );
}

/** Scope fields of a game, or of a game about to be created (id ""). */
export type GameScopeShape = Pick<
  GameScopeRef,
  "id" | "orgId" | "leagueId" | "seasonId" | "divisionId" | "homeTeamId" | "awayTeamId"
>;

function covers(a: ActiveAssignment, g: GameScopeShape): boolean {
  if (a.scopeType === "platform") return true;
  if (!a.scopeId) return false;
  switch (a.scopeType) {
    case "org":
      return a.scopeId === g.orgId;
    case "league":
      return a.scopeId === g.leagueId;
    case "season":
      return a.scopeId === g.seasonId;
    case "division":
      return a.scopeId === g.divisionId;
    case "game":
      return !!g.id && a.scopeId === g.id;
    case "team":
      return a.scopeId === g.homeTeamId || a.scopeId === g.awayTeamId;
    default:
      return false;
  }
}

export async function loadGameScopeRef(
  db: Pick<Database, "select">,
  gameId: string
): Promise<GameScopeRef | null> {
  const [row] = await db
    .select({
      id: schema.games.id,
      orgId: schema.leagues.orgId,
      leagueId: schema.games.leagueId,
      gameSeasonId: schema.games.seasonId,
      divisionSeasonId: schema.divisions.seasonId,
      divisionId: schema.games.divisionId,
      homeTeamId: schema.games.homeTeamId,
      awayTeamId: schema.games.awayTeamId,
      publishedAt: schema.games.publishedAt,
      scheduleRunId: schema.games.scheduleRunId
    })
    .from(schema.games)
    .innerJoin(schema.leagues, eq(schema.leagues.id, schema.games.leagueId))
    .leftJoin(schema.divisions, eq(schema.divisions.id, schema.games.divisionId))
    .where(eq(schema.games.id, gameId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    leagueId: row.leagueId,
    seasonId: row.gameSeasonId ?? row.divisionSeasonId ?? null,
    divisionId: row.divisionId,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    publishedAt: row.publishedAt,
    scheduleRunId: row.scheduleRunId
  };
}

/** Pool the permissions of the caller's assignments that cover `g`. */
export async function accessForScope(
  db: Database,
  userId: string,
  g: GameScopeShape
): Promise<{ superAdmin: boolean; granted: string[]; covered: boolean }> {
  if (await isSuperAdmin(db, userId)) return { superAdmin: true, granted: ["*"], covered: true };
  const granted: string[] = [];
  let covered = false;
  for (const a of await loadActiveAssignments(db, userId)) {
    if (!covers(a, g)) continue;
    covered = true;
    granted.push(...rolePermissions(a));
  }
  if (g.id) {
    for (const o of await loadOfficialAssignments(db, userId, [g.id])) {
      const perms = gameOfficialPermissions(o.role, o.status);
      if (perms.length === 0) continue;
      covered = true;
      granted.push(...perms);
    }
  }
  return { superAdmin: false, granted, covered };
}

/**
 * Pool the permissions of the caller's assignments that cover ANY of
 * `shapes` (one query for the assignments). Used for records that hang
 * off several scopes at once, e.g. a person on two teams (COMP-10).
 */
export async function accessForAnyScope(
  db: Database,
  userId: string,
  shapes: ReadonlyArray<GameScopeShape>
): Promise<{ superAdmin: boolean; granted: string[]; covered: boolean }> {
  if (await isSuperAdmin(db, userId)) return { superAdmin: true, granted: ["*"], covered: true };
  const granted: string[] = [];
  let covered = false;
  for (const a of await loadActiveAssignments(db, userId)) {
    if (!shapes.some((g) => covers(a, g))) continue;
    covered = true;
    granted.push(...rolePermissions(a));
  }
  const gameIds = shapes.map((g) => g.id).filter(Boolean);
  for (const o of await loadOfficialAssignments(db, userId, gameIds)) {
    const perms = gameOfficialPermissions(o.role, o.status);
    if (perms.length === 0) continue;
    covered = true;
    granted.push(...perms);
  }
  return { superAdmin: false, granted, covered };
}

export async function gameAccessFor(
  db: Database,
  userId: string,
  gameId: string
): Promise<GameAccess | null> {
  const game = await loadGameScopeRef(db, gameId);
  if (!game) return null;
  return { game, ...(await accessForScope(db, userId, game)) };
}

export function accessCan(
  access: { superAdmin: boolean; granted: string[] },
  permission: string
): boolean {
  return access.superAdmin || permissionGranted(access.granted, permission);
}

export function canSeeDraft(access: { superAdmin: boolean; granted: string[] }): boolean {
  return DRAFT_VIEW_PERMISSIONS.some((p) => accessCan(access, p));
}

/**
 * Read rule. Unpublished games are visible only to callers who may see
 * drafts (admins, officials, schedulers). Published games keep the old
 * rule: league in scope, or one of the two teams in scope, or a covering
 * assignment.
 */
export function gameVisible(access: GameAccess, scope: UserScope): boolean {
  if (access.superAdmin || canSeeDraft(access)) return true;
  if (!access.game.publishedAt) return false;
  if (access.covered) return true;
  if (scope.leagueIds === null || scope.leagueIds.includes(access.game.leagueId)) return true;
  const teams = scope.teamIds ?? [];
  return teams.includes(access.game.homeTeamId) || teams.includes(access.game.awayTeamId);
}

/** The game actions this caller may take, for showing or hiding buttons. */
export function viewerGamePermissions(access: { superAdmin: boolean; granted: string[] }): string[] {
  return GAME_ACTION_PERMISSIONS.filter((p) => accessCan(access, p));
}

/**
 * Load the game, 404 when the caller cannot see it, 403 when they can see
 * it but their role does not allow `permission`. `action` finishes the
 * sentence "Your role cannot ...".
 */
export async function requireGamePermission(
  db: Database,
  userId: string,
  scope: UserScope,
  gameId: string,
  permission: string,
  action: string
): Promise<GameAccess> {
  const access = await gameAccessFor(db, userId, gameId);
  if (!access || !gameVisible(access, scope)) {
    throw new NotFoundException(`Game not found: ${gameId}`);
  }
  if (!accessCan(access, permission)) {
    throw new ForbiddenException(`Your role cannot ${action}. Ask your league admin.`);
  }
  return access;
}

/**
 * True when any active assignment lets the caller see unpublished games
 * somewhere. Used to decide whether a games list must be published-only.
 */
export async function userCanSeeDraftGamesAnywhere(db: Database, userId: string): Promise<boolean> {
  if (await isSuperAdmin(db, userId)) return true;
  const rows = await loadActiveAssignments(db, userId);
  return rows.some((a) =>
    DRAFT_VIEW_PERMISSIONS.some((p) => permissionGranted(rolePermissions(a), p))
  );
}

/**
 * Which games a game-day official runs, for their "My games" list: every
 * scope where one of their role assignments grants the scoresheet
 * (`game_event.write`), plus each game they are on the crew of. `all`
 * means a platform-wide grant.
 */
export interface OfficiatingFilter {
  all: boolean;
  orgIds: string[];
  leagueIds: string[];
  seasonIds: string[];
  divisionIds: string[];
  gameIds: string[];
}

export async function officiatingFilter(db: Database, userId: string): Promise<OfficiatingFilter> {
  const f: OfficiatingFilter = { all: false, orgIds: [], leagueIds: [], seasonIds: [], divisionIds: [], gameIds: [] };
  if (await isSuperAdmin(db, userId)) return { ...f, all: true };
  const [assignments, crew] = await Promise.all([
    loadActiveAssignments(db, userId),
    loadOfficialAssignments(db, userId)
  ]);
  for (const a of assignments) {
    if (!permissionGranted(rolePermissions(a), "game_event.write")) continue;
    if (a.scopeType === "platform") f.all = true;
    if (!a.scopeId) continue;
    if (a.scopeType === "org") f.orgIds.push(a.scopeId);
    if (a.scopeType === "league") f.leagueIds.push(a.scopeId);
    if (a.scopeType === "season") f.seasonIds.push(a.scopeId);
    if (a.scopeType === "division") f.divisionIds.push(a.scopeId);
    if (a.scopeType === "game") f.gameIds.push(a.scopeId);
  }
  for (const o of crew) {
    if (gameOfficialPermissions(o.role, o.status).length > 0) f.gameIds.push(o.gameId);
  }
  return f;
}

/** True when the caller runs games anywhere (a game-day role or a crew spot). */
export async function userOfficiatesGames(db: Database, userId: string): Promise<boolean> {
  const f = await officiatingFilter(db, userId);
  return (
    f.all ||
    f.orgIds.length + f.leagueIds.length + f.seasonIds.length + f.divisionIds.length + f.gameIds.length > 0
  );
}
