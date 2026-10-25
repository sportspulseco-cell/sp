import { Logger } from "@nestjs/common";
import { and, eq, gte, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  SUSPENSION_IN_FORCE_STATUSES,
  describeSuspension,
  servesWithFinalizedGame,
  suspensionBlocksGame,
  suspensionEndsAt,
  suspensionGamesRemaining,
  suspensionInForce
} from "@sportspulse/kernel";
import { resolveEntityNames } from "../../../../shared/display/entity-names";

/**
 * Suspensions against games (UC-14). One place for the three readers
 * and the one automatic writer, so they cannot drift:
 *
 *   - lineup save refuses a suspended starter or bench player (COMP-13)
 *   - the captain's compliance page and lineup editor list who is
 *     suspended (COMP-12)
 *   - finalizing a game counts one game served for every game-count
 *     suspension of a player on either team (COMP-10)
 *
 * The rules themselves are pure and tested in the kernel
 * (packages/kernel/src/suspensions.ts).
 */

const log = new Logger("SuspensionRules");

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;

export interface StandingSuspension {
  id: string;
  personId: string;
  kind: string;
  status: string;
  nGames: number | null;
  nDays: number | null;
  servedCount: number;
  startAt: Date;
  endAt: Date | null;
  reason: string | null;
  sourceEventId: string | null;
  /** Game and team of the penalty it came from, when it came from one. */
  sourceGameId: string | null;
  sourceTeamId: string | null;
}

/** Suspensions that may still stand (active or under appeal) for these people. */
export async function loadStandingSuspensions(
  db: Exec,
  personIds: readonly string[]
): Promise<StandingSuspension[]> {
  if (personIds.length === 0) return [];
  const rows = await db
    .select({
      s: schema.suspensions,
      sourceGameId: schema.gameEvents.gameId,
      sourceTeamId: schema.gameEvents.teamId
    })
    .from(schema.suspensions)
    .leftJoin(schema.gameEvents, eq(schema.gameEvents.id, schema.suspensions.sourceEventId))
    .where(
      and(
        inArray(schema.suspensions.personId, [...new Set(personIds)]),
        inArray(schema.suspensions.status, [...SUSPENSION_IN_FORCE_STATUSES])
      )
    );
  return rows.map((r) => ({
    id: r.s.id,
    personId: r.s.personId,
    kind: r.s.kind,
    status: r.s.status,
    nGames: r.s.nGames,
    nDays: r.s.nDays,
    servedCount: r.s.servedCount,
    startAt: r.s.startAt,
    endAt: r.s.endAt,
    reason: r.s.reason,
    sourceEventId: r.s.sourceEventId,
    sourceGameId: r.sourceGameId ?? null,
    sourceTeamId: r.sourceTeamId ?? null
  }));
}

export interface SuspendedPlayer {
  suspensionId: string;
  personId: string;
  displayName: string;
  kind: string;
  /** Games still to sit out (game-count suspensions), else null. */
  gamesRemaining: number | null;
  /** When a time-based suspension ends, else null. */
  endsAt: string | null;
  reason: string | null;
  /** "2 of 3 games left", "Until Nov 3, 2026", "Until lifted". */
  label: string;
}

async function withNames(
  db: Exec,
  list: StandingSuspension[],
  now: Date
): Promise<SuspendedPlayer[]> {
  const names = await resolveEntityNames(
    db as Database,
    list.map((s) => ({ type: "person", id: s.personId }))
  );
  return list.map((s) => ({
    suspensionId: s.id,
    personId: s.personId,
    displayName: names.get(`person:${s.personId}`) ?? "Unnamed player",
    kind: s.kind,
    gamesRemaining: suspensionGamesRemaining(s),
    endsAt: suspensionEndsAt(s)?.toISOString() ?? null,
    reason: s.reason,
    label: describeSuspension(s, now)
  }));
}

/**
 * Unplayed, published games of `teamId` that start between the
 * suspension and this game. A 2-game suspension covers this game only
 * when fewer than 2 such games come first.
 */
async function unplayedTeamGamesBefore(
  db: Exec,
  teamId: string,
  from: Date,
  game: { id: string; start: Date }
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(schema.games)
    .where(
      and(
        or(eq(schema.games.homeTeamId, teamId), eq(schema.games.awayTeamId, teamId)),
        inArray(schema.games.status, ["scheduled", "in_play"]),
        isNotNull(schema.games.publishedAt),
        gte(schema.games.scheduledStartTsUtc, from),
        lt(schema.games.scheduledStartTsUtc, game.start),
        ne(schema.games.id, game.id)
      )
    );
  return row?.n ?? 0;
}

/**
 * Which of `personIds` are barred from this game for `teamId`. A
 * suspension stands across every team the player is on (benchmark C
 * R14); a game-count one is counted down on the schedule of the team
 * the penalty was taken with, or this team when it has no penalty.
 */
export async function suspensionBlocksForGame(
  db: Exec,
  args: {
    game: { id: string; start: Date };
    teamId: string;
    personIds: readonly string[];
    now?: Date;
  }
): Promise<SuspendedPlayer[]> {
  const standing = await loadStandingSuspensions(db, args.personIds);
  const blocking: StandingSuspension[] = [];
  for (const s of standing) {
    const before =
      s.kind === "n_games"
        ? await unplayedTeamGamesBefore(db, s.sourceTeamId ?? args.teamId, s.startAt, args.game)
        : 0;
    if (suspensionBlocksGame(s, { start: args.game.start, unplayedTeamGamesBefore: before })) {
      blocking.push(s);
    }
  }
  return withNames(db, blocking, args.now ?? new Date());
}

/** Active roster players of `teamId` with a suspension standing `now` (captain view). */
export async function teamSuspendedPlayers(
  db: Exec,
  teamId: string,
  now: Date = new Date()
): Promise<SuspendedPlayer[]> {
  const roster = await db
    .selectDistinct({ personId: schema.teamMemberships.personId })
    .from(schema.teamMemberships)
    .where(
      and(eq(schema.teamMemberships.teamId, teamId), eq(schema.teamMemberships.currentStatus, "active"))
    );
  const standing = (await loadStandingSuspensions(db, roster.map((r) => r.personId))).filter((s) =>
    suspensionInForce(s, now)
  );
  return withNames(db, standing, now);
}

export interface ServedOnFinalize {
  /** Game-count suspensions of players on either team that were checked. */
  considered: number;
  /** Suspensions that counted this game, after the update. */
  served: Array<{ id: string; personId: string; servedCount: number; status: string }>;
}

/**
 * Inside the finalize transaction (game row locked, status moving
 * in_play -> completed, which happens once): count this game served for
 * every game-count suspension it applies to. Atomic increments, so two
 * games finalized at once cannot lose a count.
 */
export async function serveSuspensionsForFinalizedGame(
  tx: Tx,
  game: { id: string; start: Date; seasonId: string | null; homeTeamId: string; awayTeamId: string }
): Promise<ServedOnFinalize> {
  const teamIds = [game.homeTeamId, game.awayTeamId];
  const members = await tx
    .selectDistinct({ personId: schema.teamMemberships.personId, teamId: schema.teamMemberships.teamId })
    .from(schema.teamMemberships)
    .where(
      and(
        inArray(schema.teamMemberships.teamId, teamIds),
        eq(schema.teamMemberships.currentStatus, "active"),
        ...(game.seasonId ? [eq(schema.teamMemberships.seasonId, game.seasonId)] : [])
      )
    );
  const teamsOf = new Map<string, Set<string>>();
  for (const m of members) {
    const set = teamsOf.get(m.personId) ?? new Set<string>();
    set.add(m.teamId);
    teamsOf.set(m.personId, set);
  }
  if (teamsOf.size === 0) return { considered: 0, served: [] };

  // Lock the rows this finalize may count against.
  await tx
    .select({ id: schema.suspensions.id })
    .from(schema.suspensions)
    .where(
      and(
        inArray(schema.suspensions.personId, [...teamsOf.keys()]),
        eq(schema.suspensions.kind, "n_games"),
        inArray(schema.suspensions.status, [...SUSPENSION_IN_FORCE_STATUSES])
      )
    )
    .for("update");
  const candidates = (await loadStandingSuspensions(tx, [...teamsOf.keys()])).filter(
    (s) => s.kind === "n_games"
  );

  const served: ServedOnFinalize["served"] = [];
  for (const s of candidates) {
    const teams = teamsOf.get(s.personId) ?? new Set<string>();
    const playerOnTeamInGame = s.sourceTeamId ? teams.has(s.sourceTeamId) : teams.size > 0;
    if (
      !servesWithFinalizedGame(s, {
        start: game.start,
        isSourceGame: s.sourceGameId === game.id,
        playerOnTeamInGame
      })
    ) {
      continue;
    }
    const rows = await tx
      .update(schema.suspensions)
      .set({
        servedCount: sql`${schema.suspensions.servedCount} + 1`,
        status: sql`case when ${schema.suspensions.servedCount} + 1 >= ${schema.suspensions.nGames} then 'served' else ${schema.suspensions.status} end`,
        endAt: sql`case when ${schema.suspensions.servedCount} + 1 >= ${schema.suspensions.nGames} then now() else ${schema.suspensions.endAt} end`,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(schema.suspensions.id, s.id),
          inArray(schema.suspensions.status, [...SUSPENSION_IN_FORCE_STATUSES]),
          sql`${schema.suspensions.servedCount} < ${schema.suspensions.nGames}`
        )
      )
      .returning({
        id: schema.suspensions.id,
        personId: schema.suspensions.personId,
        servedCount: schema.suspensions.servedCount,
        status: schema.suspensions.status
      });
    if (rows.length !== 1) {
      log.warn(`finalize game=${game.id}: suspension ${s.id} served update touched ${rows.length} rows`);
      continue;
    }
    served.push(rows[0]!);
  }
  log.log(
    `finalize game=${game.id} suspensions considered=${candidates.length} served=${served.length} completed=${served.filter((r) => r.status === "served").length}`
  );
  return { considered: candidates.length, served };
}
