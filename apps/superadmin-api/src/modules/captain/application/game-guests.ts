import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { resolveDivisionRules, SCHEDULABLE_ENTRY_STATUSES } from "@sportspulse/kernel";

type ResolvedDivisionRules = ReturnType<typeof resolveDivisionRules>;
import { suspensionBlocksForGame } from "../../game-operations/application/suspensions/suspension-rules";

/**
 * The one guest path (Workflow 7B · Case 7, UC-31). A guest plays one
 * game for a team: a game_attendance row (is_guest, status sub) plus a
 * roster_moves guest_add audit row, never a team_memberships row. Used
 * by the captain's "Add guest" (POST /captain/roster/:teamId/guest), a
 * sub accepting a request, and a league admin assigning a sub. Every
 * caller runs it inside its own transaction, so a refusal rolls back
 * whatever the caller wrote with it.
 *
 * Rules, all enforced here:
 *   - the game is on the team's schedule and belongs to the season
 *   - playoff games: the player is not playoff-ineligible (7C §4.1)
 *   - at most `maxGuestPlayersPerGame` guests per team per game
 *   - not on the team's active roster
 *   - at most `guestPlayerSeasonLimit` guest games per player per team
 *     per season
 *   - not suspended for this game (UC-14)
 *   - not already on this game's lineup (attendance_uniq)
 *
 * Serialised per (game, team) with a transaction-scoped advisory lock:
 * the old `SELECT ... FOR UPDATE` on the guest rows locked nothing when
 * there were none, so two adds at 0 of 1 could both pass.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const log = new Logger("GameGuests");

export interface GuestRules {
  maxGuestPlayersPerGame: number;
  guestPlayerSeasonLimit: number;
}

/** The team's division in the season (tier and rules), or null. */
export async function teamDivisionInSeason(
  db: Database | Tx,
  teamId: string,
  seasonId: string
): Promise<{ id: string; name: string; tier: string | null; rules: ResolvedDivisionRules } | null> {
  const [row] = await db
    .select({
      id: schema.divisions.id,
      name: schema.divisions.name,
      tier: schema.divisions.tier,
      ruleSetOverrides: schema.divisions.ruleSetOverrides
    })
    .from(schema.divisionTeamEntries)
    .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
    .where(
      and(
        eq(schema.divisionTeamEntries.teamId, teamId),
        eq(schema.divisions.seasonId, seasonId),
        // The live entry, never a rejected one in another division.
        inArray(schema.divisionTeamEntries.entryStatus, [...SCHEDULABLE_ENTRY_STATUSES])
      )
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    rules: resolveDivisionRules((row.ruleSetOverrides as Record<string, unknown>) ?? null)
  };
}

/** Lock the guest list of one team for one game until the transaction ends. */
export async function lockGameGuests(tx: Tx, gameId: string, teamId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`game-guests:${gameId}:${teamId}`}))`);
}

/** Guests the team already has for this game. */
export async function countGameGuests(db: Database | Tx, gameId: string, teamId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.gameAttendance)
    .where(
      and(
        eq(schema.gameAttendance.gameId, gameId),
        eq(schema.gameAttendance.teamId, teamId),
        eq(schema.gameAttendance.isGuest, true)
      )
    );
  return row?.count ?? 0;
}

export interface AddGuestInput {
  teamId: string;
  seasonId: string;
  gameId: string;
  /** A registered person. */
  personId?: string;
  /** A walk-in with no account (captain path only). */
  guestName?: string;
  actorUserId: string;
  /** Extra fields for the roster_moves metadata (e.g. the sub request id). */
  moveMetadata?: Record<string, unknown>;
}

export interface AddGuestResult {
  attendance: typeof schema.gameAttendance.$inferSelect;
  guestsThisGame: number;
  maxGuestPlayersPerGame: number;
}

export async function addGameGuest(tx: Tx, input: AddGuestInput): Promise<AddGuestResult> {
  const [game] = await tx
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, input.gameId))
    .limit(1);
  if (!game) throw new NotFoundException("Game not found");
  if (game.homeTeamId !== input.teamId && game.awayTeamId !== input.teamId) {
    throw new ForbiddenException("This game is not on your team's schedule");
  }
  if (game.seasonId && game.seasonId !== input.seasonId) {
    throw new ConflictException({
      error: "wrong_season",
      message: "This game belongs to another season."
    });
  }

  // Workflow 7C §4.1 — playoff eligibility guard (registered players only;
  // walk-in guests are accepted, admin discretion).
  if (game.gameType === "playoff" && input.personId) {
    const [er] = await tx
      .select({ ruleEvaluation: schema.eligibilityRecords.ruleEvaluation })
      .from(schema.eligibilityRecords)
      .where(
        and(
          eq(schema.eligibilityRecords.personId, input.personId),
          eq(schema.eligibilityRecords.seasonId, input.seasonId)
        )
      )
      .limit(1);
    const playoff = (er?.ruleEvaluation as Record<string, unknown> | undefined)?.[
      "playoffEligibility"
    ] as Record<string, unknown> | undefined;
    if (playoff && playoff.status === "ineligible") {
      throw new ConflictException({
        error: "playoff_ineligible",
        message: "Player is not eligible for playoff games in this season.",
        personId: input.personId,
        reason: playoff
      });
    }
  }

  const division = await teamDivisionInSeason(tx, input.teamId, input.seasonId);
  const rules: GuestRules = division?.rules ?? resolveDivisionRules(null);

  await lockGameGuests(tx, input.gameId, input.teamId);
  const guestsThisGame = await countGameGuests(tx, input.gameId, input.teamId);
  if (guestsThisGame >= rules.maxGuestPlayersPerGame) {
    throw new ConflictException({
      error: "Max guests per game",
      message: `Maximum guest players per game (${rules.maxGuestPlayersPerGame}) reached.`
    });
  }

  if (input.personId) {
    const [rostered] = await tx
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, input.teamId),
          eq(schema.teamMemberships.seasonId, input.seasonId),
          eq(schema.teamMemberships.personId, input.personId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .limit(1);
    if (rostered) {
      throw new ConflictException({
        error: "Already on roster",
        message: "This player is on your active roster, not a guest."
      });
    }

    const [seasonGuests] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.gameAttendance)
      .innerJoin(schema.games, eq(schema.games.id, schema.gameAttendance.gameId))
      .where(
        and(
          eq(schema.gameAttendance.personId, input.personId),
          eq(schema.gameAttendance.teamId, input.teamId),
          eq(schema.gameAttendance.isGuest, true),
          eq(schema.games.seasonId, input.seasonId)
        )
      );
    if ((seasonGuests?.count ?? 0) >= rules.guestPlayerSeasonLimit) {
      throw new ConflictException({
        error: "Max guest appearances",
        message: `This player has reached the maximum guest appearances (${rules.guestPlayerSeasonLimit}) for your team this season.`
      });
    }

    const blocked = await suspensionBlocksForGame(tx, {
      game: { id: game.id, start: game.scheduledStartTsUtc },
      teamId: input.teamId,
      personIds: [input.personId]
    });
    if (blocked.length > 0) {
      throw new ConflictException({
        error: "player_suspended",
        message: `Suspended for this game: ${blocked[0]!.displayName} (${blocked[0]!.label}).`
      });
    }

    const [listed] = await tx
      .select({ id: schema.gameAttendance.id })
      .from(schema.gameAttendance)
      .where(
        and(
          eq(schema.gameAttendance.gameId, input.gameId),
          eq(schema.gameAttendance.personId, input.personId)
        )
      )
      .limit(1);
    if (listed) {
      throw new ConflictException({
        error: "already_in_game",
        message: "This player is already on this game's lineup."
      });
    }
  }

  let personId = input.personId;
  if (!personId) {
    // Walk-in guest — record a thin shell person row so the FK holds.
    const [first, ...rest] = (input.guestName ?? "Guest Player").split(" ");
    const created = await tx
      .insert(schema.persons)
      .values({ legalFirstName: first || "Guest", legalLastName: rest.join(" ") || "Player" })
      .returning({ id: schema.persons.id });
    personId = created[0]!.id;
  }

  const [att] = await tx
    .insert(schema.gameAttendance)
    .values({
      gameId: input.gameId,
      teamId: input.teamId,
      personId,
      status: "sub",
      isGuest: true
    })
    .returning();
  if (!att) throw new Error(`guest insert returned no row game=${input.gameId} team=${input.teamId}`);

  await tx.insert(schema.rosterMoves).values({
    teamId: input.teamId,
    personId,
    seasonId: input.seasonId,
    moveType: "guest_add",
    membershipType: "call_up",
    effectiveAt: new Date(),
    sourceEventId: `guest-${att.id}`,
    createdByUserId: input.actorUserId,
    metadata: { gameId: input.gameId, ...(input.moveMetadata ?? {}) }
  });

  log.log(
    `guest added game=${input.gameId} team=${input.teamId} person=${personId} attendance=${att.id} guests=${guestsThisGame + 1}/${rules.maxGuestPlayersPerGame}`
  );
  return {
    attendance: att,
    guestsThisGame: guestsThisGame + 1,
    maxGuestPlayersPerGame: rules.maxGuestPlayersPerGame
  };
}
