import { teamLiveSeasons } from "../../../shared/display/team-seasons";
import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UnprocessableEntityException
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength
} from "class-validator";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  FREE_AGENT_OFFER_SOURCE,
  INVITE_DEFAULT_TTL_DAYS,
  INVITE_EXTENSION_DAYS,
  INVITE_RESEND_COOLDOWN_HOURS,
  MAX_INVITE_EXTENSIONS,
  ROSTER_DROP_REASON_MIN_CHARS,
  freeAgentOfferStatus,
  pickCurrentSeason,
  resolveDivisionRules,
  sortSeasonsByCurrency,
  teamRegistrationPath
} from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { playerWebUrl } from "../../../shared/app-urls";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { NotificationService } from "../../communications/application/notification.service";
import { notifyAudience } from "../../../shared/audience/notify-audience";
import { buildTeamInvitePayload } from "../../communications/domain/templates/team-invite-payload";
import { FreeAgentOffersService } from "../../registration-v2/application/free-agent-offers.service";
import { RosterEntryService } from "../../registration-v2/application/roster-entry.service";

/** Invite statuses that can still be accepted or declined (`extended` = reminded with a new expiry). */
const OPEN_INVITE_STATUSES = ["pending", "extended"];

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  /**
   * Accepted from older clients and ignored: an invite never billed
   * anyone (CAP-16). Shares are set on the captain's Dues page.
   */
  @IsOptional() @IsInt() @Min(0) splitAmountCents?: number;
  /** Optional sweater number the player gets when they join (FR-3.11.2). */
  @IsOptional() @IsInt() @Min(0) @Max(99) jerseyNumber?: number;
}

class InviteManyBodyDto {
  @IsUUID() seasonId!: string;
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(60) @IsUUID("4", { each: true }) personIds!: string[];
}

class JerseyBodyDto {
  @IsUUID() seasonId!: string;
  @IsUUID() personId!: string;
  /** null clears the number. */
  @IsOptional() @IsInt() @Min(0) @Max(99) jerseyNumber!: number | null;
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
  private readonly log = new Logger(CaptainRosterController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService,
    private readonly faOffers: FreeAgentOffersService,
    private readonly rosterEntry: RosterEntryService
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
    @Query("seasonId") seasonId?: string,
    @Query("asOf") asOf?: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);

    // Every season the team is live in, most current first (shared rule
    // in @sportspulse/kernel). The first one is the default; the list
    // feeds the season switcher so the roster page and the invite flow
    // can never silently work on different seasons (CAP-8, CAP-24).
    // `asOf` evaluates the same rule at another instant: the lineup
    // editor passes the game's kickoff so a game in an earlier-starting
    // season gets that season's roster, not today's (SCH-23).
    const asOfDate = asOf ? new Date(asOf) : null;
    if (asOfDate && Number.isNaN(asOfDate.getTime())) {
      throw new BadRequestException("asOf must be an ISO date-time");
    }
    const teamSeasons = await this.loadTeamSeasons(teamId);
    const season = seasonId
      ? await this.loadSeason(seasonId)
      : asOfDate
        ? pickCurrentSeason(teamSeasons, asOfDate)
        : teamSeasons[0] ?? null;
    const seasons = teamSeasons.map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      isCurrent: s.id === teamSeasons[0]?.id
    }));

    if (!season) {
      return {
        team: { id: team.id, name: team.name },
        season: null,
        seasons,
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
        // FR-3.11.2: captains see their players' contact details (read only;
        // players edit their own on /profile).
        personPhone: schema.profiles.phoneE164,
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

    // Players registering onto this team (FR-3.4.1, UC-04): they join the
    // roster when the league approves the registration.
    const joining = await this.db
      .select({
        registrationId: schema.registrations.id,
        status: schema.registrations.status,
        personId: schema.registrations.subjectPersonId,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName,
        metadata: schema.registrations.metadata
      })
      .from(schema.registrations)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.registrations.subjectPersonId))
      .where(
        and(
          eq(schema.registrations.teamId, teamId),
          eq(schema.registrations.seasonId, season.id),
          inArray(schema.registrations.status, [
            "pending_consent",
            "pending_payment",
            "pending_offline",
            "pending_review",
            "incomplete"
          ])
        )
      )
      .orderBy(desc(schema.registrations.createdAt));

    return {
      team: { id: team.id, name: team.name },
      season: {
        id: season.id,
        name: season.name,
        rosterLockAt: season.rosterLockAt?.toISOString() ?? null
      },
      seasons,
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
      joining: joining
        .filter((j) => (j.metadata as Record<string, unknown> | null)?.submissionType !== "team")
        .map((j) => ({
          registrationId: j.registrationId,
          personId: j.personId,
          name: [j.firstName, j.lastName].filter(Boolean).join(" ").trim() || null,
          status: j.status,
          stage: ["pending_review", "pending_offline", "incomplete"].includes(j.status)
            ? ("awaiting_approval" as const)
            : ("registering" as const)
        })),
      rosterLockAt: season.rosterLockAt?.toISOString() ?? null,
      isLocked: season.rosterLockAt
        ? new Date() > season.rosterLockAt
        : false
    };
  }

  // -------------------------------------------------------------------
  // GET /captain/roster/:teamId/past-players  (FR-3.4.3)
  // -------------------------------------------------------------------
  @Get(":teamId/past-players")
  @ApiOperation({
    summary:
      "Players who were on this team in other seasons, for inviting them to `seasonId` in one go (FR-3.4.3, UC-04 'selects from past roster'). Marks who is already on the season's roster or has an open invite, and who has no email."
  })
  async pastPlayers(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId: string
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    if (!seasonId) throw new BadRequestException("seasonId is required");
    const rows = (await this.db.execute(sql`
      SELECT DISTINCT ON (tm.person_id)
             tm.person_id, p.legal_first_name AS first, p.legal_last_name AS last, p.preferred_name AS preferred,
             lower(coalesce(pr.email, p.external_ids->>'email')) AS email,
             s.name AS season_name, s.start_date AS season_start, tm.jersey_number
        FROM team_memberships tm
        JOIN persons p ON p.id = tm.person_id
        JOIN seasons s ON s.id = tm.season_id
        LEFT JOIN profiles pr ON pr.id = p.user_id
       WHERE tm.team_id = ${teamId} AND tm.season_id <> ${seasonId}
       ORDER BY tm.person_id, s.start_date DESC NULLS LAST
    `)) as unknown as Array<{
      person_id: string; first: string | null; last: string | null; preferred: string | null;
      email: string | null; season_name: string; season_start: string | null; jersey_number: number | null;
    }>;
    const ids = rows.map((r) => r.person_id);
    const [onRoster, openInvites] = ids.length
      ? await Promise.all([
          this.db
            .select({ personId: schema.teamMemberships.personId })
            .from(schema.teamMemberships)
            .where(
              and(
                eq(schema.teamMemberships.teamId, teamId),
                eq(schema.teamMemberships.seasonId, seasonId),
                eq(schema.teamMemberships.currentStatus, "active"),
                inArray(schema.teamMemberships.personId, ids)
              )
            ),
          this.db
            .select({ email: schema.teamInvites.inviteeEmail })
            .from(schema.teamInvites)
            .where(
              and(
                eq(schema.teamInvites.teamId, teamId),
                eq(schema.teamInvites.seasonId, seasonId),
                inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES)
              )
            )
        ])
      : [[], []];
    const rostered = new Set(onRoster.map((r) => r.personId));
    const invited = new Set(openInvites.map((r) => (r.email ?? "").toLowerCase()));
    return {
      items: rows
        .map((r) => ({
          personId: r.person_id,
          name: (r.preferred && r.preferred.trim()) || [r.first, r.last].filter(Boolean).join(" ").trim() || "Unnamed player",
          email: r.email,
          lastSeasonName: r.season_name,
          lastJerseyNumber: r.jersey_number,
          state: rostered.has(r.person_id)
            ? ("on_roster" as const)
            : r.email && invited.has(r.email)
              ? ("invited" as const)
              : !r.email
                ? ("no_email" as const)
                : ("can_invite" as const)
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/:teamId/invite-many  (FR-3.4.3)
  // -------------------------------------------------------------------
  @Post(":teamId/invite-many")
  @ApiOperation({
    summary:
      "Invite several past players to a season in one go. Each must have been on this team before; players already on the roster, already invited or without an email are skipped and named. Same invite as one by email (14-day expiry, email with the link)."
  })
  async inviteMany(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: InviteManyBodyDto
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const season = await this.loadSeason(body.seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.assertRosterUnlocked(season);
    const past = await this.pastPlayers(user, teamId, season.id);
    const byId = new Map(past.items.map((p) => [p.personId, p]));
    const results: Array<{ personId: string; name: string | null; outcome: string }> = [];
    for (const personId of Array.from(new Set(body.personIds))) {
      const p = byId.get(personId);
      if (!p) {
        results.push({ personId, name: null, outcome: "not_a_past_player" });
        continue;
      }
      if (p.state !== "can_invite") {
        results.push({ personId, name: p.name, outcome: p.state === "invited" ? "already_invited" : p.state });
        continue;
      }
      await this.createInvite(team, season, p.email!, user.userId, {
        source: "past_roster",
        personId,
        jerseyNumber: p.lastJerseyNumber ?? null
      });
      results.push({ personId, name: p.name, outcome: "invited" });
    }
    const invited = results.filter((r) => r.outcome === "invited").length;
    this.log.log(`invite-many team=${teamId} season=${season.id} asked=${body.personIds.length} invited=${invited}`);
    return { invited, results };
  }

  // -------------------------------------------------------------------
  // PATCH /captain/roster/:teamId/jersey  (FR-3.11.2)
  // -------------------------------------------------------------------
  @Patch(":teamId/jersey")
  @ApiOperation({
    summary:
      "Captain sets or clears a rostered player's jersey number. Unique per team and season (409 naming who wears it). Allowed after the roster lock: a number is not a roster move."
  })
  async setJersey(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: JerseyBodyDto
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    const jerseyNumber = body.jerseyNumber ?? null;
    const [m] = await this.db
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.seasonId, body.seasonId),
          eq(schema.teamMemberships.personId, body.personId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .limit(1);
    if (!m) throw new NotFoundException("This player is not on the active roster.");
    await this.rosterEntry.assertJerseyFree(this.db, {
      teamId,
      seasonId: body.seasonId,
      jerseyNumber,
      exceptPersonId: body.personId
    });
    try {
      const updated = await this.db
        .update(schema.teamMemberships)
        .set({ jerseyNumber, updatedAt: new Date() })
        .where(eq(schema.teamMemberships.id, m.id))
        .returning({ id: schema.teamMemberships.id, jerseyNumber: schema.teamMemberships.jerseyNumber });
      if (updated.length !== 1) throw new Error(`jersey update touched ${updated.length} rows membership=${m.id}`);
      this.log.log(`jersey team=${teamId} person=${body.personId} -> ${jerseyNumber ?? "none"}`);
      return { membershipId: m.id, jerseyNumber: updated[0]!.jerseyNumber };
    } catch (e) {
      // Two captains saving the same number at once: the unique index decides.
      if ((e as { code?: string }).code === "23505") {
        throw new ConflictException({
          error: "jersey_number_taken",
          message: `Number ${jerseyNumber} was just taken by another player. Pick another number.`
        });
      }
      throw e;
    }
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
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const season = await this.loadSeason(body.seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.assertRosterUnlocked(season);
    const division = await this.loadCurrentDivision(teamId, season.id);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );

    const [person] = await this.db
      .select({
        id: schema.persons.id,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        externalIds: schema.persons.externalIds,
        email: schema.profiles.email
      })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(eq(schema.persons.id, body.personId))
      .limit(1);
    if (!person) throw new NotFoundException("Person not found");
    const name = [person.first, person.last].filter(Boolean).join(" ").trim() || "This player";

    await this.assertNotActiveInOtherSeason(teamId, body.personId, season.id);
    await this.rosterEntry.assertJerseyFree(this.db, {
      teamId,
      seasonId: season.id,
      jerseyNumber: body.jerseyNumber ?? null
    });

    // A player joins a roster through the season's registration (form,
    // waivers, payment) and the league's approval. Registered players
    // join now; a submitted registration records the team and joins on
    // approval; anyone else gets an invite to register onto the team.
    const reg = await this.rosterEntry.seasonRegistration(body.personId, season.id);
    const readiness = reg?.readiness ?? "register";
    this.log.log(
      `captain add team=${teamId} season=${season.id} person=${body.personId} registration=${reg?.id ?? "-"}:${reg?.status ?? "-"} -> ${readiness}`
    );
    if (readiness === "ready") {
      const res = await this.rosterEntry.addToRoster({
        teamId,
        seasonId: season.id,
        personId: body.personId,
        maxRosterSize: rules.maxRosterSize,
        actorUserId: user.userId,
        jerseyNumber: body.jerseyNumber ?? null,
        positionCode: body.positionCode ?? null,
        reason: "Added by captain"
      });
      return {
        status: "rostered" as const,
        message: `${name} is on the roster.`,
        move: res.move,
        membership: res.membership
      };
    }
    const opening = await this.rosterEntry.opening(teamId, season.id);
    if (opening?.refusal) {
      throw new ConflictException({ error: opening.refusal.reason, message: opening.refusal.message });
    }
    if (readiness === "awaiting_approval" && reg) {
      await this.rosterEntry.recordTeamOnRegistration(reg, teamId, { source: "captain_add" });
      return {
        status: "awaiting_approval" as const,
        message: `${name} registered for ${season.name} and is waiting for the league to approve it. They join ${team.name} when it is approved.`
      };
    }
    const ext = (person.externalIds as Record<string, unknown> | null) ?? {};
    const email = (person.email ?? (typeof ext.email === "string" ? ext.email : "") ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      throw new ConflictException({
        error: "player_has_no_email",
        message: `${name} has not registered for ${season.name} and has no email on file, so they cannot be invited. Ask them to register for the season, or invite them by email.`
      });
    }
    const invite = await this.createInvite(team, season, email, user.userId, {
      source: "captain_add",
      personId: body.personId,
      jerseyNumber: body.jerseyNumber ?? null
    });
    return {
      status: "invited" as const,
      message: `${name} has not registered for ${season.name} yet. We sent them an invite to register and join ${team.name}; they join the roster when the league approves their registration.`,
      invite
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/invites/:token/accept  (UC-04)
  // The invited player accepts a captain's invite link. Same roster
  // add as the captain's Add player (lock, cap, duplicate check); the
  // invite flips to accepted in the same transaction. Before this there
  // was no accept path at all (CAP-1).
  // -------------------------------------------------------------------
  @Post("invites/:token/accept")
  @ApiOperation({
    summary:
      "Signed-in player accepts a team invite or a free-agent offer. Personal invites must match the player's email. Same roster add as the captain's Add player (lock, cap, duplicate, other-season rule); a free-agent offer also marks the pool entry placed and withdraws other teams' offers, in the same transaction. 409 when expired, revoked, already used, roster full or locked."
  })
  async acceptInvite(
    @CurrentUser() user: AuthPrincipal,
    @Param("token") token: string
  ) {
    const [invite] = await this.db
      .select()
      .from(schema.teamInvites)
      .where(eq(schema.teamInvites.token, token))
      .limit(1);
    if (!invite) throw new NotFoundException("Invite not found");
    // `extended` is a reminded invite with a new expiry; it was refused
    // here before, so every reminded invite became unusable.
    if (!OPEN_INVITE_STATUSES.includes(invite.status)) {
      throw new ConflictException(`This invite is ${invite.status}. Ask your captain for a new one.`);
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ConflictException("This invite has expired. Ask your captain for a new one.");
    }

    const [me] = await this.db
      .select({ personId: schema.persons.id, email: schema.profiles.email })
      .from(schema.profiles)
      .leftJoin(schema.persons, eq(schema.persons.userId, schema.profiles.id))
      .where(eq(schema.profiles.id, user.userId))
      .limit(1);
    if (
      invite.kind === "personal" &&
      invite.inviteeEmail &&
      invite.inviteeEmail.toLowerCase() !== (me?.email ?? "").toLowerCase()
    ) {
      throw new ForbiddenException(
        `This invite was sent to ${invite.inviteeEmail}. Sign in with that email to accept it.`
      );
    }
    if (!me?.personId) {
      throw new ConflictException(
        "Finish your player profile first, then open this invite again."
      );
    }

    const season = await this.loadSeason(invite.seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.assertRosterUnlocked(season);
    // Same one-active-membership rule as the captain's Add player (CAP-24).
    await this.assertNotActiveInOtherSeason(invite.teamId, me.personId, season.id);
    const division = await this.loadCurrentDivision(invite.teamId, season.id);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );
    const meta = (invite.metadata as Record<string, unknown>) ?? {};
    const isFreeAgentOffer = meta.source === FREE_AGENT_OFFER_SOURCE;
    const personId = me.personId;
    const metaJersey = typeof meta.jerseyNumber === "number" ? meta.jerseyNumber : null;

    // UC-04: the player accepts and completes registration (waivers,
    // payment), then joins. Approved registration: join now. Submitted,
    // waiting for the league: the team is recorded and they join on
    // approval. No registration: register first, with the team set.
    const reg = await this.rosterEntry.seasonRegistration(personId, season.id);
    const readiness = reg?.readiness ?? "register";
    this.log.log(
      `invite accept invite=${invite.id} team=${invite.teamId} person=${personId} registration=${reg?.id ?? "-"}:${reg?.status ?? "-"} -> ${readiness}`
    );
    const markAccepted = async (tx: Tx, extra: Record<string, unknown> = {}) => {
      const accepted = await tx
        .update(schema.teamInvites)
        .set({
          status: "accepted",
          acceptedByUserId: user.userId,
          acceptedAt: new Date(),
          updatedAt: new Date(),
          ...(Object.keys(extra).length
            ? { metadata: sql`${schema.teamInvites.metadata} || ${JSON.stringify(extra)}::jsonb` }
            : {})
        })
        .where(
          and(
            eq(schema.teamInvites.id, invite.id),
            inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES)
          )
        )
        .returning({ id: schema.teamInvites.id });
      if (accepted.length !== 1) {
        throw new ConflictException("This invite was just used or withdrawn. Ask your captain for a new one.");
      }
    };

    if (readiness === "register") {
      const opening = await this.rosterEntry.opening(invite.teamId, season.id);
      if (opening?.refusal) {
        throw new ConflictException({ error: opening.refusal.reason, message: opening.refusal.message });
      }
      const [team] = await this.db
        .select({ name: schema.teams.name })
        .from(schema.teams)
        .where(eq(schema.teams.id, invite.teamId))
        .limit(1);
      return {
        status: "registration_required" as const,
        teamId: invite.teamId,
        seasonId: season.id,
        teamName: team?.name ?? null,
        seasonName: season.name,
        registerPath: teamRegistrationPath(season.id, invite.teamId, invite.token),
        message: `Register for ${season.name} to join ${team?.name ?? "the team"}. You join the roster when the league approves your registration.`
      };
    }

    if (readiness === "awaiting_approval" && reg) {
      const opening = await this.rosterEntry.opening(invite.teamId, season.id);
      if (opening?.refusal) {
        throw new ConflictException({ error: opening.refusal.reason, message: opening.refusal.message });
      }
      await this.db.transaction(async (tx) => {
        await this.rosterEntry.recordTeamOnRegistration(reg, invite.teamId, {
          inviteId: invite.id,
          source: isFreeAgentOffer ? "free_agent_offer" : "team_invite",
          exec: tx
        });
        await markAccepted(tx, { awaitingRegistrationId: reg.id });
        await this.faOffers.placeOnAccept(tx, invite, personId);
      });
      if (isFreeAgentOffer) void this.faOffers.notifyOutcome(invite.id, "accepted");
      return {
        status: "awaiting_approval" as const,
        teamId: invite.teamId,
        seasonId: season.id,
        registrationId: reg.id,
        message: `Your registration for ${season.name} is waiting for the league. You join the roster when it is approved.`
      };
    }

    const result = await this.rosterEntry.addToRoster({
      teamId: invite.teamId,
      seasonId: season.id,
      personId,
      maxRosterSize: rules.maxRosterSize,
      actorUserId: user.userId,
      jerseyNumber: metaJersey,
      positionCode: null,
      reason: isFreeAgentOffer ? "Free-agent offer accepted" : "Invite accepted",
      inTx: async (tx) => {
        await markAccepted(tx);
        // Free-agent offer: the pool entry is placed in this same
        // transaction (CAP-9), so roster and pool never disagree.
        await this.faOffers.placeOnAccept(tx, invite, personId);
      }
    });
    if (isFreeAgentOffer) void this.faOffers.notifyOutcome(invite.id, "accepted");
    return {
      status: "rostered" as const,
      teamId: invite.teamId,
      seasonId: season.id,
      membershipId: result.membership.id
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/roster/invites/:token/decline  (UC-03, UC-04)
  // The invited player says no. A free-agent offer leaves the player in
  // the pool; the person who made it is told.
  // -------------------------------------------------------------------
  @Post("invites/:token/decline")
  @ApiOperation({
    summary:
      "Signed-in player declines a team invite or free-agent offer addressed to their email. Nothing changes on the roster; a free agent stays in the pool and the offering captain or admin is notified. 409 when the invite is no longer open."
  })
  async declineInvite(
    @CurrentUser() user: AuthPrincipal,
    @Param("token") token: string
  ) {
    const [invite] = await this.db
      .select()
      .from(schema.teamInvites)
      .where(eq(schema.teamInvites.token, token))
      .limit(1);
    if (!invite) throw new NotFoundException("Invite not found");
    const [me] = await this.db
      .select({ email: schema.profiles.email })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.userId))
      .limit(1);
    if (
      invite.kind !== "personal" ||
      !invite.inviteeEmail ||
      invite.inviteeEmail.toLowerCase() !== (me?.email ?? "").toLowerCase()
    ) {
      throw new ForbiddenException(
        invite.inviteeEmail
          ? `This invite was sent to ${invite.inviteeEmail}. Sign in with that email to answer it.`
          : "Only a personal invite can be declined."
      );
    }
    if (!OPEN_INVITE_STATUSES.includes(invite.status)) {
      throw new ConflictException(`This invite is already ${invite.status}.`);
    }
    const now = new Date();
    const updated = await this.db
      .update(schema.teamInvites)
      .set({
        status: "declined",
        updatedAt: now,
        metadata: sql`${schema.teamInvites.metadata} || ${JSON.stringify({
          declinedAt: now.toISOString(),
          declinedByUserId: user.userId
        })}::jsonb`
      })
      .where(
        and(
          eq(schema.teamInvites.id, invite.id),
          inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES)
        )
      )
      .returning({ id: schema.teamInvites.id, status: schema.teamInvites.status });
    if (updated.length !== 1) {
      throw new ConflictException("This invite was just answered or withdrawn.");
    }
    const meta = (invite.metadata as Record<string, unknown>) ?? {};
    if (meta.source === FREE_AGENT_OFFER_SOURCE) {
      void this.faOffers.notifyOutcome(invite.id, "declined");
    } else {
      // UC-04 alternative flow: "Player declines invite -> System
      // notifies captain" (FR-3.4.4). Before this nobody was told.
      void this.notifyInviteDeclined(invite, user.userId);
    }
    return { id: invite.id, status: updated[0]!.status, teamId: invite.teamId, seasonId: invite.seasonId };
  }

  private async notifyInviteDeclined(
    invite: typeof schema.teamInvites.$inferSelect,
    declinerUserId: string
  ): Promise<void> {
    try {
      const [ctx] = await this.db
        .select({ teamName: schema.teams.name, orgId: schema.teams.orgId, seasonName: schema.seasons.name })
        .from(schema.teams)
        .leftJoin(schema.seasons, eq(schema.seasons.id, invite.seasonId))
        .where(eq(schema.teams.id, invite.teamId))
        .limit(1);
      const [player] = await this.db
        .select({
          personId: schema.persons.id,
          first: schema.persons.legalFirstName,
          last: schema.persons.legalLastName,
          preferred: schema.persons.preferredName
        })
        .from(schema.persons)
        .where(eq(schema.persons.userId, declinerUserId))
        .limit(1);
      const playerName =
        (player?.preferred && player.preferred.trim()) ||
        [player?.first, player?.last].filter(Boolean).join(" ").trim() ||
        invite.inviteeEmail ||
        "The player";
      if (!ctx) return;
      const res = await notifyAudience(this.db, this.notify, {
        orgId: ctx.orgId,
        target: { teamIds: [invite.teamId] },
        audiences: ["captains"],
        templateCode: "TEAM_INVITE_DECLINED",
        key: `invite-declined-${invite.id}`,
        excludePersonIds: player?.personId ? [player.personId] : [],
        payload: { playerName, teamName: ctx.teamName, seasonName: ctx.seasonName ?? "the season", seasonId: invite.seasonId }
      });
      this.log.log(`invite declined invite=${invite.id} team=${invite.teamId} captains queued=${res.queued}`);
    } catch (e) {
      this.log.error(`invite declined notice failed invite=${invite.id}: ${(e as Error).message}`);
    }
  }

  // -------------------------------------------------------------------
  // GET /captain/roster/invites/mine  (player-web home + /team)
  // Open team invites and free-agent offers addressed to the caller.
  // -------------------------------------------------------------------
  @Get("invites/mine")
  @ApiOperation({
    summary:
      "The caller's open personal invites and free-agent offers (not expired), newest first, with the token to accept or decline."
  })
  async myInvites(@CurrentUser() user: AuthPrincipal) {
    const [me] = await this.db
      .select({ email: schema.profiles.email })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.userId))
      .limit(1);
    const email = (me?.email ?? "").trim().toLowerCase();
    if (!email) return { items: [] };
    const rows = await this.db
      .select({
        id: schema.teamInvites.id,
        token: schema.teamInvites.token,
        status: schema.teamInvites.status,
        expiresAt: schema.teamInvites.expiresAt,
        createdAt: schema.teamInvites.createdAt,
        metadata: schema.teamInvites.metadata,
        teamId: schema.teamInvites.teamId,
        teamName: schema.teams.name,
        seasonId: schema.teamInvites.seasonId,
        seasonName: schema.seasons.name
      })
      .from(schema.teamInvites)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamInvites.teamId))
      .leftJoin(schema.seasons, eq(schema.seasons.id, schema.teamInvites.seasonId))
      .where(
        and(
          eq(schema.teamInvites.kind, "personal"),
          sql`lower(${schema.teamInvites.inviteeEmail}) = ${email}`,
          inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES)
        )
      )
      .orderBy(desc(schema.teamInvites.createdAt));
    const now = new Date();
    return {
      items: rows
        .filter((r) => freeAgentOfferStatus(r.status, r.expiresAt, now) === "pending")
        .map((r) => ({
          id: r.id,
          token: r.token,
          kind:
            (r.metadata as Record<string, unknown> | null)?.source === FREE_AGENT_OFFER_SOURCE
              ? ("free_agent_offer" as const)
              : ("team_invite" as const),
          teamId: r.teamId,
          teamName: r.teamName,
          seasonId: r.seasonId,
          seasonName: r.seasonName ?? null,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString()
        }))
    };
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
      // The admins who decide refunds for this season (COMP-19).
      await notifyAudience(this.db, this.notify, {
        orgId: team.orgId,
        target: { leagueIds: [season.leagueId], seasonIds: [season.id] },
        audiences: ["all_admins"],
        templateCode: "REFUND_ASSESSMENT_REQUIRED",
        key: `refund-assess-${dropResult.refundAssessment.id}`,
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
    await this.rosterEntry.assertJerseyFree(this.db, {
      teamId,
      seasonId: season.id,
      jerseyNumber: body.jerseyNumber ?? null
    });
    const invite = await this.createInvite(team, season, body.email, user.userId, {
      source: "captain_invite",
      jerseyNumber: body.jerseyNumber ?? null
    });
    return { invite };
  }

  /**
   * One personal invite + its email. The link opens /invite/<token>;
   * accepting it sends a player with no season registration into the
   * funnel with the team set (UC-04).
   */
  private async createInvite(
    team: { id: string; orgId: string; name: string },
    season: { id: string; name: string; registrationClosesAt: Date | null },
    email: string,
    actorUserId: string,
    metadata: Record<string, unknown>
  ) {
    const ttlMs = INVITE_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
    const closeAt = season.registrationClosesAt;
    const expiresAt = new Date(
      Math.min(
        Date.now() + ttlMs,
        closeAt ? closeAt.getTime() : Date.now() + ttlMs
      )
    );
    const token = randomBytes(32).toString("base64url");
    const cleanMeta = Object.fromEntries(
      Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined)
    );
    const [invite] = await this.db
      .insert(schema.teamInvites)
      .values({
        teamId: team.id,
        seasonId: season.id,
        issuedByUserId: actorUserId,
        inviteeEmail: email.toLowerCase(),
        token,
        kind: "personal",
        status: "pending",
        expiresAt,
        lastSentAt: new Date(),
        sendCount: 1,
        metadata: cleanMeta
      })
      .returning();
    this.log.log(`invite created invite=${invite!.id} team=${team.id} season=${season.id} source=${String(metadata.source)}`);
    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "TEAM_INVITE_NEW",
      idempotencyKey: `invite-${invite!.id}`,
      recipientEmail: email,
      payload: buildTeamInvitePayload({
        teamName: team.name,
        seasonName: season.name,
        seasonId: season.id,
        token,
        expiresAt,
        playerWebUrl: playerWebUrl(this.config)
      })
    });
    return invite!;
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

    const inviteSeason = await this.loadSeason(invite.seasonId);
    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "INVITE_REMINDER_2",
      idempotencyKey: `remind-${invite.id}-${invite.extensionCount + 1}`,
      recipientEmail: invite.inviteeEmail ?? undefined,
      payload: buildTeamInvitePayload({
        teamName: team.name,
        seasonName: inviteSeason?.name ?? "the upcoming season",
        seasonId: invite.seasonId,
        token: invite.token,
        expiresAt: newExpiry,
        playerWebUrl: playerWebUrl(this.config)
      })
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
              eq(schema.gameAttendance.isGuest, true),
              // The limit is per season; this counted every season before.
              eq(schema.games.seasonId, season.id)
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

  /**
   * Seasons the team is live in (entry applied / accepted / confirmed),
   * most current first per `sortSeasonsByCurrency` in @sportspulse/kernel:
   * in progress today, else registration window open now, else newest.
   * The old `ORDER BY start_date DESC LIMIT 1` sent captains of a team
   * registered for a future season to that season's empty roster (CAP-8).
   */
  private async loadTeamSeasons(teamId: string) {
    return teamLiveSeasons(this.db, teamId);
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

  /** One active membership per player per team across live seasons (CAP-24); shared rule. */
  private assertNotActiveInOtherSeason(teamId: string, personId: string, seasonId: string) {
    return this.rosterEntry.assertNotActiveInOtherSeason(teamId, personId, seasonId);
  }

  private assertRosterUnlocked(season: { rosterLockAt: Date | null }) {
    this.rosterEntry.assertUnlocked(season);
  }
}
