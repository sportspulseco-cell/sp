import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { SYSTEM_ROLE_BY_CODE, permissionGranted } from "@sportspulse/kernel";
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

interface ActiveAssignment {
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
  "stats.recompute"
] as const;

async function isSuperAdmin(db: Database, userId: string): Promise<boolean> {
  const [p] = await db
    .select({ s: schema.profiles.isSuperAdmin })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);
  return !!p?.s;
}

async function loadActiveAssignments(db: Database, userId: string): Promise<ActiveAssignment[]> {
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

function rolePermissions(a: ActiveAssignment): string[] {
  if (a.isSystem) {
    const def = SYSTEM_ROLE_BY_CODE[a.roleCode];
    if (def) return def.defaultPermissions;
  }
  return Array.isArray(a.rolePermissions)
    ? a.rolePermissions.filter((p): p is string => typeof p === "string")
    : [];
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
