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
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { NotificationService } from "../../communications/application/notification.service";

class ApplyBodyDto {
  @IsUUID() teamId!: string;
  /**
   * Required — the season the player wants to be rostered for. On
   * captain approval we insert a `team_memberships` row, which is
   * NOT NULL on season_id. See migration 0030.
   */
  @IsUUID() seasonId!: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

class DecideBodyDto {
  @IsIn(["approve", "reject"]) action!: "approve" | "reject";
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

/**
 * Player → captain "I want to join your team" flow. Complements:
 *   - team_invites           (captain → player)
 *   - free_agent_pool_entries (player advertises themselves; captain claims)
 *
 * Mounted at /captain/team-join-requests (admin/captain surface) and
 * /me/team-join-requests (player surface — same controller for cohesion).
 */
@ApiTags("captain/team-join-requests")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class TeamJoinRequestsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  // -------------------------------------------------------------------
  // POST /me/team-join-requests  (player applies)
  // -------------------------------------------------------------------
  @Post("me/team-join-requests")
  @ApiOperation({
    summary:
      "Player applies to join a team. Looks up the caller's linked person, ensures no open request exists for the same (team, season), and queues a notification to the team captain."
  })
  async apply(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: ApplyBodyDto
  ) {
    const person = await this.resolvePerson(user.userId);
    if (!person) {
      throw new BadRequestException(
        "No player profile linked to your account yet."
      );
    }

    const [team] = await this.db
      .select({
        id: schema.teams.id,
        orgId: schema.teams.orgId,
        name: schema.teams.name
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, body.teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    // Block if the player already has a roster row on this team for the
    // same season — captain has already accepted them.
    const [existingMember] = await this.db
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, body.teamId),
          eq(schema.teamMemberships.personId, person.id),
          eq(schema.teamMemberships.seasonId, body.seasonId)
        )
      )
      .limit(1);
    if (existingMember) {
      throw new ConflictException({
        error: "already_on_roster",
        message: "You're already on this team's roster for that season."
      });
    }

    // De-dup: one open request per (team, player, season).
    const [openExisting] = await this.db
      .select({ id: schema.teamJoinRequests.id })
      .from(schema.teamJoinRequests)
      .where(
        and(
          eq(schema.teamJoinRequests.teamId, body.teamId),
          eq(schema.teamJoinRequests.playerPersonId, person.id),
          eq(schema.teamJoinRequests.seasonId, body.seasonId),
          eq(schema.teamJoinRequests.status, "pending")
        )
      )
      .limit(1);
    if (openExisting) {
      throw new ConflictException({
        error: "already_pending",
        message: "You already have a pending application to this team."
      });
    }

    const [row] = await this.db
      .insert(schema.teamJoinRequests)
      .values({
        teamId: body.teamId,
        playerPersonId: person.id,
        seasonId: body.seasonId,
        message: body.message?.trim() || null,
        status: "pending"
      })
      .returning();

    // Notify the captain. Idempotent on (request id) so dupes (retries
    // from the client) don't spam the inbox.
    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "PLAYER_JOIN_REQUEST",
      idempotencyKey: `join-req-${row!.id}`,
      payload: {
        teamId: team.id,
        teamName: team.name,
        playerPersonId: person.id,
        playerFullName: person.fullName,
        playerEmail: person.email,
        message: row!.message
      }
    });

    return { id: row!.id, status: row!.status };
  }

  // -------------------------------------------------------------------
  // GET /me/team-join-requests  (player views their own)
  // -------------------------------------------------------------------
  @Get("me/team-join-requests")
  @ApiOperation({
    summary:
      "All team-join requests the caller has filed, newest first, enriched with team + decision context."
  })
  async listMine(@CurrentUser() user: AuthPrincipal) {
    const person = await this.resolvePerson(user.userId);
    if (!person) return { items: [] };

    const rows = await this.db
      .select({
        id: schema.teamJoinRequests.id,
        status: schema.teamJoinRequests.status,
        appliedAt: schema.teamJoinRequests.appliedAt,
        decidedAt: schema.teamJoinRequests.decidedAt,
        decisionReason: schema.teamJoinRequests.decisionReason,
        message: schema.teamJoinRequests.message,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        orgName: schema.orgs.displayName,
        seasonId: schema.teamJoinRequests.seasonId
      })
      .from(schema.teamJoinRequests)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamJoinRequests.teamId))
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.teams.orgId))
      .where(eq(schema.teamJoinRequests.playerPersonId, person.id))
      .orderBy(desc(schema.teamJoinRequests.appliedAt))
      .limit(50);

    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        appliedAt: r.appliedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionReason: r.decisionReason,
        message: r.message,
        teamId: r.teamId,
        teamName: r.teamName,
        orgName: r.orgName,
        seasonId: r.seasonId
      }))
    };
  }

  // -------------------------------------------------------------------
  // GET /me/joinable-teams (teams the player can apply to)
  // -------------------------------------------------------------------
  // Powers the player-web /team empty state: "you registered for this
  // season/division — here are the teams you can apply to." Built
  // from the caller's APPROVED registrations (which have division_id
  // assigned), then joined to active DTE rows in that division. Teams
  // the player is already rostered on, or has a pending join request
  // for, are filtered out — the UI surfaces those separately via
  // /me/team-join-requests and /roster/memberships.
  // -------------------------------------------------------------------
  @Get("me/joinable-teams")
  @ApiOperation({
    summary:
      "Teams the caller can apply to join, derived from their approved registrations. Returns active-DTE teams in the registered division, minus teams the player is already on or already applied to."
  })
  async listJoinableTeams(@CurrentUser() user: AuthPrincipal) {
    const person = await this.resolvePerson(user.userId);
    if (!person) return { items: [] };

    // Player's approved registrations with an assigned division. We
    // accept both `approved` and `submitted` so a player who's mid-
    // review can still see what they'll be eligible for.
    const myRegs = await this.db
      .select({
        seasonId: schema.registrations.seasonId,
        divisionId: schema.registrations.divisionId
      })
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.subjectPersonId, person.id),
          inArray(schema.registrations.status, ["approved", "submitted"])
        )
      );

    const divisionIds = Array.from(
      new Set(
        myRegs
          .map((r) => r.divisionId)
          .filter((v): v is string => typeof v === "string")
      )
    );
    if (divisionIds.length === 0) return { items: [] };

    // Active DTE rows in those divisions, joined to teams + season +
    // division for display. entry_status filter mirrors the captain's
    // division-detail "approved teams" query.
    const rows = await this.db
      .select({
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        teamShortName: schema.teams.shortName,
        teamLogoUrl: schema.teams.logoUrl,
        teamColors: schema.teams.colors,
        seasonId: schema.divisions.seasonId,
        seasonName: schema.seasons.name,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name,
        divisionTier: schema.divisions.tier,
        orgName: schema.orgs.displayName,
        entryStatus: schema.divisionTeamEntries.entryStatus
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
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.divisionTeamEntries.teamId)
      )
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.teams.orgId))
      .where(
        and(
          inArray(schema.divisionTeamEntries.divisionId, divisionIds),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      );

    if (rows.length === 0) return { items: [] };

    // Exclude teams the player is already on (any season) and teams
    // with an open application from this player. We resolve once for
    // all teams to keep the query count flat.
    const teamIds = Array.from(new Set(rows.map((r) => r.teamId)));
    const [alreadyMember, openApps] = await Promise.all([
      this.db
        .select({ teamId: schema.teamMemberships.teamId })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.personId, person.id),
            inArray(schema.teamMemberships.teamId, teamIds)
          )
        ),
      this.db
        .select({ teamId: schema.teamJoinRequests.teamId })
        .from(schema.teamJoinRequests)
        .where(
          and(
            eq(schema.teamJoinRequests.playerPersonId, person.id),
            eq(schema.teamJoinRequests.status, "pending"),
            inArray(schema.teamJoinRequests.teamId, teamIds)
          )
        )
    ]);
    const exclude = new Set([
      ...alreadyMember.map((r) => r.teamId),
      ...openApps.map((r) => r.teamId)
    ]);

    return {
      items: rows
        .filter((r) => !exclude.has(r.teamId))
        .map((r) => ({
          teamId: r.teamId,
          teamName: r.teamName,
          teamShortName: r.teamShortName,
          teamLogoUrl: r.teamLogoUrl,
          teamColors: (r.teamColors ?? {}) as Record<string, unknown>,
          seasonId: r.seasonId,
          seasonName: r.seasonName,
          divisionId: r.divisionId,
          divisionName: r.divisionName,
          divisionTier: r.divisionTier,
          orgName: r.orgName,
          entryStatus: r.entryStatus
        }))
    };
  }

  // -------------------------------------------------------------------
  // GET /captain/team-join-requests?teamId=…  (captain inbox)
  // -------------------------------------------------------------------
  @Get("captain/team-join-requests")
  @ApiOperation({
    summary:
      "Captain inbox of join requests for a team. Returns pending by default; pass status=all to include decided ones."
  })
  async listForCaptain(
    @CurrentUser() user: AuthPrincipal,
    @Query("teamId") teamId: string,
    @Query("status") status?: string
  ) {
    if (!teamId) throw new BadRequestException("teamId required");
    const ok = await userIsCaptainOfTeam(this.db, user.userId, teamId);
    if (!ok) throw new ForbiddenException("Not the captain of this team");

    const statusFilter =
      status === "all"
        ? inArray(schema.teamJoinRequests.status, [
            "pending",
            "approved",
            "rejected",
            "withdrawn"
          ])
        : eq(schema.teamJoinRequests.status, "pending");

    const rows = await this.db
      .select({
        id: schema.teamJoinRequests.id,
        status: schema.teamJoinRequests.status,
        appliedAt: schema.teamJoinRequests.appliedAt,
        decidedAt: schema.teamJoinRequests.decidedAt,
        decisionReason: schema.teamJoinRequests.decisionReason,
        message: schema.teamJoinRequests.message,
        seasonId: schema.teamJoinRequests.seasonId,
        playerPersonId: schema.teamJoinRequests.playerPersonId,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName,
        preferredName: schema.persons.preferredName,
        userId: schema.persons.userId,
        playerEmail: schema.profiles.email
      })
      .from(schema.teamJoinRequests)
      .innerJoin(
        schema.persons,
        eq(schema.persons.id, schema.teamJoinRequests.playerPersonId)
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.persons.userId)
      )
      .where(
        and(eq(schema.teamJoinRequests.teamId, teamId), statusFilter)
      )
      .orderBy(desc(schema.teamJoinRequests.appliedAt));

    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        appliedAt: r.appliedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionReason: r.decisionReason,
        message: r.message,
        seasonId: r.seasonId,
        playerPersonId: r.playerPersonId,
        playerName:
          r.preferredName ||
          [r.firstName, r.lastName].filter(Boolean).join(" ") ||
          null,
        playerEmail: r.playerEmail ?? null
      }))
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/team-join-requests/:id/decide
  // -------------------------------------------------------------------
  @Post("captain/team-join-requests/:id/decide")
  @ApiOperation({
    summary:
      "Captain approves or rejects a player's join request. On approval, an active team_membership row is inserted for the player at the request's season (if set)."
  })
  async decide(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: DecideBodyDto
  ) {
    const [row] = await this.db
      .select({
        id: schema.teamJoinRequests.id,
        teamId: schema.teamJoinRequests.teamId,
        playerPersonId: schema.teamJoinRequests.playerPersonId,
        seasonId: schema.teamJoinRequests.seasonId,
        status: schema.teamJoinRequests.status,
        orgId: schema.teams.orgId,
        teamName: schema.teams.name
      })
      .from(schema.teamJoinRequests)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.teamJoinRequests.teamId)
      )
      .where(eq(schema.teamJoinRequests.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Request not found");
    if (row.status !== "pending") {
      throw new ConflictException({
        error: "not_pending",
        message: `Request is in status=${row.status}.`
      });
    }

    const ok = await userIsCaptainOfTeam(this.db, user.userId, row.teamId);
    if (!ok) throw new ForbiddenException("Not the captain of this team");

    const nextStatus = body.action === "approve" ? "approved" : "rejected";

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.teamJoinRequests)
        .set({
          status: nextStatus,
          decidedAt: new Date(),
          decidedByUserId: user.userId,
          decisionReason: body.reason?.trim() || null,
          updatedAt: new Date()
        })
        .where(eq(schema.teamJoinRequests.id, id));

      // On approve, create the active roster row (idempotent on the
      // active uniqueness index — duplicate insert silently bails out).
      if (body.action === "approve") {
        await tx
          .insert(schema.teamMemberships)
          .values({
            teamId: row.teamId,
            personId: row.playerPersonId,
            seasonId: row.seasonId,
            membershipType: "primary",
            effectiveFrom: new Date(),
            currentStatus: "active"
          })
          .onConflictDoNothing();
      }
    });

    void this.notify.queue({
      orgId: row.orgId,
      templateCode:
        body.action === "approve"
          ? "PLAYER_JOIN_APPROVED"
          : "PLAYER_JOIN_REJECTED",
      idempotencyKey: `join-decide-${id}`,
      payload: {
        teamId: row.teamId,
        teamName: row.teamName,
        playerPersonId: row.playerPersonId,
        reason: body.reason?.trim() || null
      }
    });

    return { id, status: nextStatus };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  private async resolvePerson(userId: string): Promise<
    { id: string; fullName: string | null; email: string | null } | null
  > {
    const [row] = await this.db
      .select({
        id: schema.persons.id,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName,
        preferredName: schema.persons.preferredName,
        email: schema.profiles.email
      })
      .from(schema.persons)
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.persons.userId)
      )
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (!row) return null;
    const fullName =
      row.preferredName ||
      [row.firstName, row.lastName].filter(Boolean).join(" ") ||
      null;
    return { id: row.id, fullName, email: row.email ?? null };
  }
}
