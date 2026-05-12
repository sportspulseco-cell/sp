import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  UnprocessableEntityException
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength
} from "class-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  INVITE_DEFAULT_TTL_DAYS,
  INVITE_EXTENSION_DAYS,
  INVITE_RESEND_COOLDOWN_HOURS,
  MAX_INVITE_EXTENSIONS,
  ROSTER_DROP_REASON_MIN_CHARS,
  resolveDivisionRules
} from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { NotificationService } from "../../communications/application/notification.service";

/**
 * Workflow 7B · Sprint 5 — captain roster management (cases 1–5).
 *
 * Append-only contract: every state change writes a `roster_moves`
 * row first and projects to `team_memberships` second. Both writes
 * happen inside a serialisable transaction. `SELECT … FOR UPDATE`
 * locks the active count before insert so two simultaneous adds at
 * cap-1 deterministically resolve to one 200 + one 409.
 *
 * Roster lock: every mutation re-reads `seasons.roster_lock_at` and
 * throws 409 (carrying the lock timestamp) when `now() > lock`.
 * The captain UI hides the action bar after the lock so this guard
 * is a defence-in-depth, not the primary UX.
 */

// =====================================================================
// DTOs
// =====================================================================

class AddPlayerBodyDto {
  @IsUUID() seasonId!: string;
  @IsUUID() personId!: string;
  @IsOptional() @IsInt() @Min(0) jerseyNumber?: number;
  @IsOptional() @IsString() positionCode?: string;
}

class DropPlayerBodyDto {
  @IsUUID() seasonId!: string;
  @IsUUID() personId!: string;
  @IsString() @MinLength(ROSTER_DROP_REASON_MIN_CHARS) reason!: string;
}

class InviteBodyDto {
  @IsUUID() seasonId!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsInt() @Min(0) splitAmountCents?: number;
}

class GuestBodyDto {
  @IsUUID() seasonId!: string;
  @IsUUID() gameId!: string;
  @IsOptional() @IsUUID() personId?: string;
  @IsOptional() @IsString() guestName?: string;
}

// =====================================================================
// Controller
// =====================================================================

@ApiTags("captain/roster")
@ApiBearerAuth()
@Controller("captain/roster")
@UseGuards(JwtAuthGuard)
export class CaptainRosterController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  // -------------------------------------------------------------------
  // GET /captain/roster/:teamId
  // -------------------------------------------------------------------
  @Get(":teamId")
  @ApiOperation({
    summary:
      "List the team's current active roster + pending invites + lock metadata. Powers the captain roster screen."
  })
  async listRoster(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);

    const season = seasonId
      ? await this.loadSeason(seasonId)
      : await this.loadActiveSeason(teamId);

    if (!season) {
      return {
        team: { id: team.id, name: team.name },
        season: null,
        division: null,
        rules: resolveDivisionRules(null),
        memberships: [],
        invites: [],
        rosterLockAt: null,
        isLocked: false
      };
    }

    const division = await this.loadCurrentDivision(teamId, season.id);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );

    const memberships = await this.db
      .select({
        id: schema.teamMemberships.id,
        personId: schema.teamMemberships.personId,
        membershipType: schema.teamMemberships.membershipType,
        currentStatus: schema.teamMemberships.currentStatus,
        effectiveFrom: schema.teamMemberships.effectiveFrom,
        jerseyNumber: schema.teamMemberships.jerseyNumber,
        positionCode: schema.teamMemberships.positionCode,
        personFirstName: schema.persons.legalFirstName,
        personLastName: schema.persons.legalLastName,
        personEmail: schema.profiles.email,
        personDob: schema.persons.dobDate
      })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.persons,
        eq(schema.persons.id, schema.teamMemberships.personId)
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.persons.userId)
      )
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.seasonId, season.id),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .orderBy(schema.persons.legalLastName, schema.persons.legalFirstName);

    const invites = await this.db
      .select({
        id: schema.teamInvites.id,
        email: schema.teamInvites.inviteeEmail,
        status: schema.teamInvites.status,
        expiresAt: schema.teamInvites.expiresAt,
        sendCount: schema.teamInvites.sendCount,
        extensionCount: schema.teamInvites.extensionCount,
        lastSentAt: schema.teamInvites.lastSentAt,
        createdAt: schema.teamInvites.createdAt
      })
      .from(schema.teamInvites)
      .where(
        and(
          eq(schema.teamInvites.teamId, teamId),
          eq(schema.teamInvites.seasonId, season.id),
          inArray(schema.teamInvites.status, [
            "pending",
            "extended",
            "expired"
          ])
        )
      )
      .orderBy(desc(schema.teamInvites.createdAt));

    return {
      team: { id: team.id, name: team.name },
      season: {
        id: season.id,
        name: season.name,
        rosterLockAt: season.rosterLockAt?.toISOString() ?? null
      },
      division: division
        ? { id: division.id, name: division.name, tier: division.tier }
        : null,
      rules,
      memberships: memberships.map((m) => ({
        ...m,
        effectiveFrom: m.effectiveFrom.toISOString(),
        personDob: m.personDob ? String(m.personDob) : null
      })),
      invites: invites.map((i) => ({
        ...i,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        lastSentAt: i.lastSentAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString()
      })),
      rosterLockAt: season.rosterLockAt?.toISOString() ?? null,
      isLocked: season.rosterLockAt
        ? new Date() > season.rosterLockAt
        : false
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/:teamId/add  (Case 5)
  // -------------------------------------------------------------------
  @Post(":teamId/add")
  @ApiOperation({
    summary:
      "Mid-season add. SELECT FOR UPDATE on the active count, then insert roster_moves + team_memberships in one transaction. 409 when roster cap is hit or lock has passed."
  })
  async addPlayer(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: AddPlayerBodyDto
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    const season = await this.loadSeason(body.seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.assertRosterUnlocked(season);
    const division = await this.loadCurrentDivision(teamId, season.id);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );

    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.id, body.personId))
      .limit(1);
    if (!person) throw new NotFoundException("Person not found");

    return await this.db.transaction(async (tx) => {
      // Lock the active count for this team+season; the row-level lock
      // serialises two competing adds at cap-1.
      await tx.execute(sql`
        SELECT id FROM team_memberships
        WHERE team_id = ${teamId}
          AND season_id = ${season.id}
          AND current_status = 'active'
        FOR UPDATE
      `);

      const counted = await tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, teamId),
            eq(schema.teamMemberships.seasonId, season.id),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      const current = counted[0]?.count ?? 0;
      if (current >= rules.maxRosterSize) {
        throw new ConflictException({
          error: "Roster is full",
          message:
            "Another player may have registered simultaneously. Refresh and try again.",
          maxRosterSize: rules.maxRosterSize,
          currentCount: current
        });
      }

      // Already on roster? Refuse the duplicate.
      const existing = await tx
        .select({ id: schema.teamMemberships.id })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, teamId),
            eq(schema.teamMemberships.seasonId, season.id),
            eq(schema.teamMemberships.personId, body.personId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        )
        .limit(1);
      if (existing[0]) {
        throw new ConflictException({
          error: "Already on roster",
          message: "This player is already on the active roster."
        });
      }

      const moveRows = await tx
        .insert(schema.rosterMoves)
        .values({
          teamId,
          personId: body.personId,
          seasonId: season.id,
          moveType: "add",
          membershipType: "primary",
          effectiveAt: new Date(),
          jerseyNumber: body.jerseyNumber ?? null,
          positionCode: body.positionCode ?? null,
          createdByUserId: user.userId
        })
        .returning();
      const move = moveRows[0]!;

      const membershipRows = await tx
        .insert(schema.teamMemberships)
        .values({
          teamId,
          personId: body.personId,
          seasonId: season.id,
          membershipType: "primary",
          effectiveFrom: new Date(),
          jerseyNumber: body.jerseyNumber ?? null,
          positionCode: body.positionCode ?? null,
          currentStatus: "active",
          lastMoveId: move.id
        })
        .returning();
      const membership = membershipRows[0]!;

      return { move, membership };
    });
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/:teamId/drop  (Case 4)
  // -------------------------------------------------------------------
  @Post(":teamId/drop")
  @ApiOperation({
    summary:
      "Drop a player. Requires a written reason (≥ 20 chars). Blocked after rosterLockAt. Creates roster_moves: drop, projects team_memberships → inactive, and triggers refund assessment for any paid sub-invoice."
  })
  async dropPlayer(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: DropPlayerBodyDto
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const season = await this.loadSeason(body.seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.assertRosterUnlocked(season);

    if (body.reason.trim().length < ROSTER_DROP_REASON_MIN_CHARS) {
      throw new UnprocessableEntityException(
        `A reason of at least ${ROSTER_DROP_REASON_MIN_CHARS} characters is required.`
      );
    }

    const dropResult = await this.db.transaction(async (tx) => {
      const [active] = await tx
        .select()
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, teamId),
            eq(schema.teamMemberships.seasonId, season.id),
            eq(schema.teamMemberships.personId, body.personId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        )
        .limit(1);
      if (!active) {
        throw new ConflictException({
          error: "Not on roster",
          message: "This player is not on the active roster."
        });
      }

      const dropRows = await tx
        .insert(schema.rosterMoves)
        .values({
          teamId,
          personId: body.personId,
          seasonId: season.id,
          moveType: "drop",
          membershipType: active.membershipType,
          effectiveAt: new Date(),
          reason: body.reason.trim(),
          createdByUserId: user.userId
        })
        .returning();
      const move = dropRows[0]!;

      await tx
        .update(schema.teamMemberships)
        .set({
          currentStatus: "released",
          effectiveTo: new Date(),
          lastMoveId: move.id,
          updatedAt: new Date()
        })
        .where(eq(schema.teamMemberships.id, active.id));

      // Refund assessment: locate the player's sub-invoice on this
      // team's master invoice for this season.
      const [dte] = await tx
        .select({ invoiceId: schema.divisionTeamEntries.invoiceId })
        .from(schema.divisionTeamEntries)
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            eq(schema.divisionTeamEntries.teamId, teamId),
            eq(schema.divisions.seasonId, season.id)
          )
        )
        .limit(1);

      let refundAssessment: { id: string; status: string } | null = null;
      let voidedInvoiceId: string | null = null;

      if (dte?.invoiceId) {
        const [subInvoice] = await tx
          .select()
          .from(schema.invoices)
          .where(
            and(
              eq(schema.invoices.parentInvoiceId, dte.invoiceId),
              eq(schema.invoices.recipientPersonId, body.personId),
              eq(schema.invoices.invoiceType, "sub_invoice")
            )
          )
          .limit(1);

        if (subInvoice) {
          if (subInvoice.paidCents > 0) {
            const raRows = await tx
              .insert(schema.refundAssessments)
              .values({
                orgId: team.orgId,
                teamId,
                seasonId: season.id,
                personId: body.personId,
                sourceMoveId: move.id,
                sourceEvent: "drop",
                invoiceId: subInvoice.id,
                paidCents: subInvoice.paidCents,
                currency: subInvoice.currency,
                status: "pending",
                metadata: { dropReason: body.reason.trim() }
              })
              .returning({
                id: schema.refundAssessments.id,
                status: schema.refundAssessments.status
              });
            refundAssessment = raRows[0] ?? null;
          } else {
            await tx
              .update(schema.invoices)
              .set({ status: "void", updatedAt: new Date() })
              .where(eq(schema.invoices.id, subInvoice.id));
            voidedInvoiceId = subInvoice.id;
          }
        }
      }

      return { move, refundAssessment, voidedInvoiceId };
    });

    // Notifications (post-tx, fire-and-forget per CLAUDE.md pattern).
    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "DROP_CONFIRMED",
      idempotencyKey: `drop-${dropResult.move.id}`,
      recipientPersonId: body.personId,
      payload: {
        teamName: team.name,
        reason: body.reason.trim()
      }
    });
    if (dropResult.refundAssessment) {
      void this.notify.queue({
        orgId: team.orgId,
        templateCode: "REFUND_ASSESSMENT_REQUIRED",
        idempotencyKey: `refund-assess-${dropResult.refundAssessment.id}`,
        payload: {
          teamName: team.name,
          refundAssessmentId: dropResult.refundAssessment.id
        }
      });
    }

    return dropResult;
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/:teamId/invite  (Case 3 + 5 right panel)
  // -------------------------------------------------------------------
  @Post(":teamId/invite")
  @ApiOperation({
    summary:
      "Invite a player by email. Creates a personal team_invites row + sub-invoice on the team's master invoice. Blocked after rosterLockAt."
  })
  async invitePlayer(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: InviteBodyDto
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const season = await this.loadSeason(body.seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.assertRosterUnlocked(season);

    const ttlMs = INVITE_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
    const closeAt = season.registrationClosesAt;
    const expiresAt = new Date(
      Math.min(
        Date.now() + ttlMs,
        closeAt ? closeAt.getTime() : Date.now() + ttlMs
      )
    );

    const token = randomBytes(32).toString("base64url");

    const inviteRows = await this.db
      .insert(schema.teamInvites)
      .values({
        teamId,
        seasonId: season.id,
        issuedByUserId: user.userId,
        inviteeEmail: body.email.toLowerCase(),
        token,
        kind: "personal",
        status: "pending",
        expiresAt,
        lastSentAt: new Date(),
        sendCount: 1
      })
      .returning();
    const invite = inviteRows[0]!;

    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "TEAM_INVITE_NEW",
      idempotencyKey: `invite-${invite.id}`,
      recipientEmail: body.email,
      payload: {
        teamName: team.name,
        token,
        expiresAt: expiresAt.toISOString(),
        seasonId: season.id
      }
    });

    return { invite };
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/:teamId/remind/:inviteId  (Case 3)
  // -------------------------------------------------------------------
  @Post(":teamId/remind/:inviteId")
  @ApiOperation({
    summary:
      "Resend an invite. Rate-limited (1/24h) and capped at MAX_INVITE_EXTENSIONS extensions per season. Resets expiry by INVITE_EXTENSION_DAYS."
  })
  async remindInvite(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Param("inviteId") inviteId: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);

    const [invite] = await this.db
      .select()
      .from(schema.teamInvites)
      .where(
        and(
          eq(schema.teamInvites.id, inviteId),
          eq(schema.teamInvites.teamId, teamId)
        )
      )
      .limit(1);
    if (!invite) throw new NotFoundException("Invite not found");

    if (
      invite.status === "accepted" ||
      invite.status === "revoked" ||
      invite.status === "declined"
    ) {
      throw new ConflictException({
        error: "Invite finalized",
        message: `Invite is already ${invite.status}.`
      });
    }

    if (invite.extensionCount >= MAX_INVITE_EXTENSIONS) {
      throw new ConflictException({
        error: "Max extensions reached",
        message: `Maximum invite extensions (${MAX_INVITE_EXTENSIONS}) reached for this player.`
      });
    }

    const cooldownMs = INVITE_RESEND_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (
      invite.lastSentAt &&
      Date.now() - invite.lastSentAt.getTime() < cooldownMs
    ) {
      throw new ConflictException({
        error: "Resend cooldown",
        message: `Wait ${INVITE_RESEND_COOLDOWN_HOURS}h between resends.`
      });
    }

    const newExpiry = new Date(
      Date.now() + INVITE_EXTENSION_DAYS * 24 * 60 * 60 * 1000
    );

    const [updated] = await this.db
      .update(schema.teamInvites)
      .set({
        status: "extended",
        expiresAt: newExpiry,
        extensionCount: invite.extensionCount + 1,
        sendCount: invite.sendCount + 1,
        lastSentAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.teamInvites.id, inviteId))
      .returning();

    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "INVITE_REMINDER_2",
      idempotencyKey: `remind-${invite.id}-${invite.extensionCount + 1}`,
      recipientEmail: invite.inviteeEmail ?? undefined,
      payload: {
        teamName: team.name,
        token: invite.token,
        expiresAt: newExpiry.toISOString()
      }
    });

    return { invite: updated };
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/:teamId/guest  (Case 7)
  // -------------------------------------------------------------------
  @Post(":teamId/guest")
  @ApiOperation({
    summary:
      "Add a guest player to a single game's lineup. Enforces maxGuestPlayersPerGame, guestPlayerSeasonLimit, and not-already-rostered. Writes game_attendance + a roster_moves: guest_add audit row only — NO team_memberships."
  })
  async addGuest(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: GuestBodyDto
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    if (!body.personId && !body.guestName) {
      throw new BadRequestException(
        "Either personId or guestName is required."
      );
    }

    const season = await this.loadSeason(body.seasonId);
    if (!season) throw new NotFoundException("Season not found");

    const [game] = await this.db
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, body.gameId))
      .limit(1);
    if (!game) throw new NotFoundException("Game not found");
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) {
      throw new ForbiddenException("This game is not on your team's schedule");
    }

    // Workflow 7C §4.1 — playoff eligibility guard. Only enforced on
    // playoff games, and only when we have a registered personId
    // (walk-in guests are accepted; admin discretion).
    if (game.gameType === "playoff" && body.personId) {
      const [er] = await this.db
        .select({ ruleEvaluation: schema.eligibilityRecords.ruleEvaluation })
        .from(schema.eligibilityRecords)
        .where(
          and(
            eq(schema.eligibilityRecords.personId, body.personId),
            eq(schema.eligibilityRecords.seasonId, season.id)
          )
        )
        .limit(1);
      const playoff =
        (er?.ruleEvaluation as Record<string, unknown> | undefined)?.[
          "playoffEligibility"
        ] as Record<string, unknown> | undefined;
      if (playoff && playoff.status === "ineligible") {
        throw new ConflictException({
          error: "playoff_ineligible",
          message:
            "Player is not eligible for playoff games in this season.",
          personId: body.personId,
          reason: playoff
        });
      }
    }

    const division = await this.loadCurrentDivision(teamId, season.id);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );

    return await this.db.transaction(async (tx) => {
      // Lock guest count for this game+team to serialise the cap check.
      await tx.execute(sql`
        SELECT id FROM game_attendance
        WHERE game_id = ${body.gameId}
          AND team_id = ${teamId}
          AND is_guest = true
        FOR UPDATE
      `);

      const currentGuests = await tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.gameAttendance)
        .where(
          and(
            eq(schema.gameAttendance.gameId, body.gameId),
            eq(schema.gameAttendance.teamId, teamId),
            eq(schema.gameAttendance.isGuest, true)
          )
        );
      const guestsThisGame = currentGuests[0]?.count ?? 0;
      if (guestsThisGame >= rules.maxGuestPlayersPerGame) {
        throw new ConflictException({
          error: "Max guests per game",
          message: `Maximum guest players per game (${rules.maxGuestPlayersPerGame}) reached.`
        });
      }

      // Per-player season limit (only when we know personId).
      if (body.personId) {
        const rostered = await tx
          .select({ id: schema.teamMemberships.id })
          .from(schema.teamMemberships)
          .where(
            and(
              eq(schema.teamMemberships.teamId, teamId),
              eq(schema.teamMemberships.seasonId, season.id),
              eq(schema.teamMemberships.personId, body.personId),
              eq(schema.teamMemberships.currentStatus, "active")
            )
          )
          .limit(1);
        if (rostered[0]) {
          throw new ConflictException({
            error: "Already on roster",
            message: "This player is on your active roster — not a guest."
          });
        }

        const seasonGuests = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.gameAttendance)
          .innerJoin(
            schema.games,
            eq(schema.games.id, schema.gameAttendance.gameId)
          )
          .where(
            and(
              eq(schema.gameAttendance.personId, body.personId),
              eq(schema.gameAttendance.teamId, teamId),
              eq(schema.gameAttendance.isGuest, true)
            )
          );
        const count = seasonGuests[0]?.count ?? 0;
        if (count >= rules.guestPlayerSeasonLimit) {
          throw new ConflictException({
            error: "Max guest appearances",
            message: `This player has reached the maximum guest appearances (${rules.guestPlayerSeasonLimit}) for your team this season.`
          });
        }
      }

      let personId = body.personId;
      if (!personId) {
        // Walk-in guest — record a thin shell person row so the FK holds.
        const [first, ...rest] = (body.guestName ?? "Guest Player").split(" ");
        const created = await tx
          .insert(schema.persons)
          .values({
            legalFirstName: first || "Guest",
            legalLastName: rest.join(" ") || "Player"
          })
          .returning({ id: schema.persons.id });
        personId = created[0]!.id;
      }

      const attRows = await tx
        .insert(schema.gameAttendance)
        .values({
          gameId: body.gameId,
          teamId,
          personId,
          status: "sub",
          isGuest: true
        })
        .returning();
      const att = attRows[0]!;

      await tx.insert(schema.rosterMoves).values({
        teamId,
        personId,
        seasonId: season.id,
        moveType: "guest_add",
        membershipType: "call_up",
        effectiveAt: new Date(),
        sourceEventId: `guest-${att.id}`,
        createdByUserId: user.userId,
        metadata: { gameId: body.gameId }
      });

      return { attendance: att };
    });
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async requireCaptainTeam(userId: string, teamId: string) {
    const [team] = await this.db
      .select({
        id: schema.teams.id,
        orgId: schema.teams.orgId,
        name: schema.teams.name,
        captainUserId: schema.teams.captainUserId
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const ok = await userIsCaptainOfTeam(
      this.db,
      userId,
      teamId,
      team.captainUserId
    );
    if (!ok) throw new ForbiddenException("Not the captain of this team");
    return team;
  }

  private async loadSeason(seasonId: string) {
    const [s] = await this.db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    return s ?? null;
  }

  private async loadActiveSeason(teamId: string) {
    const rows = await this.db
      .select({
        seasonId: schema.seasons.id,
        season: schema.seasons
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      )
      .orderBy(desc(schema.seasons.startDate))
      .limit(1);
    return rows[0]?.season ?? null;
  }

  private async loadCurrentDivision(teamId: string, seasonId: string) {
    const [row] = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        tier: schema.divisions.tier,
        ruleSetOverrides: schema.divisions.ruleSetOverrides
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          eq(schema.divisions.seasonId, seasonId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  private assertRosterUnlocked(season: { rosterLockAt: Date | null }) {
    if (season.rosterLockAt && new Date() > season.rosterLockAt) {
      throw new ConflictException({
        error: "Roster locked",
        message: "Roster is locked for this season.",
        rosterLockAt: season.rosterLockAt.toISOString()
      });
    }
  }

}
