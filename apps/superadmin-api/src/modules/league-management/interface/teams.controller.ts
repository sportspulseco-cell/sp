import { teamLiveSeasons } from "../../../shared/display/team-seasons";
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import type { AuthPrincipal } from "@sportspulse/auth";
import { accessCan, accessForScope } from "../../../shared/auth/game-access";
import { TeamDto, TeamPageDto } from "../application/dtos/team.dto";
import {
  CreateTeamHandler,
  GetTeamHandler,
  ListTeamsHandler,
  UpdateTeamHandler,
  DissolveTeamHandler
} from "../application/teams/handlers";
import {
  AssignCaptainBodyDto,
  CreateTeamBodyDto,
  ListTeamsQueryDto,
  SetTeamStatusBodyDto,
  UpdateTeamBodyDto
} from "./dto/team.dto";

/**
 * externalIds update for the optional "Home rink" field. A blank value
 * removes the key. jsonb_set with to_jsonb(NULL) returns NULL, which
 * the NOT NULL external_ids column rejected (SETUP-6: blank rink 500'd
 * after the team row was already written).
 */
function homeRinkExternalIds(homeRink: string | null | undefined) {
  const current = sql`COALESCE(${schema.teams.externalIds}, '{}'::jsonb)`;
  const value = homeRink?.trim();
  return value
    ? sql`jsonb_set(${current}, '{homeRink}', to_jsonb(${value}::text))`
    : sql`${current} - 'homeRink'`;
}

@ApiTags("league-management/teams")
@ApiBearerAuth()
@Controller("league/teams")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class TeamsController {
  constructor(
    private readonly listH: ListTeamsHandler,
    private readonly getH: GetTeamHandler,
    private readonly createH: CreateTeamHandler,
    private readonly updateH: UpdateTeamHandler,
    private readonly dissolveH: DissolveTeamHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() async list(
    @Query() q: ListTeamsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<TeamPageDto> {
    const filter =
      scope.leagueIds && scope.leagueIds.length === 0 && (scope.teamIds?.length ?? 0) > 0
        ? undefined
        : (scope.leagueIds ?? undefined);
    // Pass scope.orgIds alongside leagueIds — handler union's them so
    // org admins also see orphan teams (no division entry) in their
    // orgs. `null` orgIds is unrestricted, so leave undefined in that
    // case.
    const orgFilter = scope.orgIds ?? undefined;
    const page = await this.listH.execute({
      ...q,
      leagueIdsFilter: filter,
      orgIdsFilter: orgFilter
    });
    // `divisionId` (P2-2) narrows in SQL to teams playing in that
    // division, so a page is never short and paging reaches every team.
    // It used to filter each page after the fact, which left pickers
    // with a partial list (SCH-20).
    if (page.items.length === 0) return page;
    const items = page.items;
    const ids = items.map((t) => t.id);
    const lifecycle = await this.loadLifecycle(ids);
    return {
      ...page,
      items: items.map((t) => this.mergeLifecycle(t, lifecycle.get(t.id)))
    };
  }

  @Get(":id/seasons")
  @ApiOperation({
    summary:
      "Seasons the team is live in, most current first (same rule as the captain roster). For anyone who can see the team (CAP-19)."
  })
  async seasons(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ) {
    // Same visibility as GET :id: a team the caller cannot see is a 404.
    const inDirectTeamScope = scope.teamIds?.includes(id) ?? false;
    await this.getH.execute({
      id,
      leagueIdsFilter: inDirectTeamScope ? undefined : (scope.leagueIds ?? undefined),
      orgIdsFilter: inDirectTeamScope ? undefined : (scope.orgIds ?? undefined)
    });
    const seasons = await teamLiveSeasons(this.db, id);
    return seasons.map((s, i) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      registrationOpensAt: s.registrationOpensAt,
      registrationClosesAt: s.registrationClosesAt,
      isCurrent: i === 0
    }));
  }

  @Get(":id") async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<TeamDto> {
    const inDirectTeamScope = scope.teamIds?.includes(id) ?? false;
    const dto = await this.getH.execute({
      id,
      leagueIdsFilter: inDirectTeamScope ? undefined : (scope.leagueIds ?? undefined),
      // Org admins should reach orphan teams in their orgs even when
      // those teams aren't in any league. Handler union's the two
      // filters; a team is in scope if either accepts.
      orgIdsFilter: inDirectTeamScope ? undefined : (scope.orgIds ?? undefined)
    });
    return this.enrichWithLifecycle(dto);
  }

  @Post()
  @ApiOperation({
    summary:
      "Create a persistent org-level team (Workflow 7A Phase 1). Returns 422 with `existingTeamId` if a team with the same name already exists in this org. When `captainUserId` is provided, the team + captain role assignment + teams.captainUserId all land in one transaction."
  })
  async create(@Body() body: CreateTeamBodyDto): Promise<TeamDto> {
    // ARCH 2: only super_admin / org_admin can create teams. The
    // controller-level AuthorizedAccessGuard already enforces that
    // mutations require non-scoped access — captains are blocked here.

    // Duplicate-name guard. Case-insensitive per org. Returns 422 with
    // the existing team's id so the UI can deep-link to it.
    const duplicate = await this.db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.orgId, body.orgId),
          sql`lower(${schema.teams.name}) = lower(${body.name})`,
          isNull(schema.teams.deletedAt)
        )
      )
      .limit(1);
    if (duplicate[0]) {
      throw new ConflictException({
        message: "A team with this name already exists in this organization.",
        errors: [
          {
            field: "name",
            message:
              "A team with this name already exists in this organization.",
            existingTeamId: duplicate[0].id
          }
        ]
      });
    }

    // Create the core team via the existing handler — keeps domain
    // invariants intact (id format, name trim, status default).
    const team = await this.createH.execute({
      orgId: body.orgId,
      name: body.name,
      sportCode: body.sportCode,
      shortName: body.shortName,
      logoUrl: body.logoUrl,
      colors: body.colors
    });

    // Workflow-7A extensions (home rink + confirmation threshold) plus
    // the optional initial captain. Done as a follow-up Drizzle write
    // so the core handler stays unchanged.
    if (
      body.homeRink !== undefined ||
      body.confirmationThresholdCents !== undefined
    ) {
      await this.db
        .update(schema.teams)
        .set({
          ...(body.homeRink !== undefined
            ? {
                externalIds: homeRinkExternalIds(body.homeRink)
              }
            : {}),
          ...(body.confirmationThresholdCents !== undefined
            ? { confirmationThresholdCents: body.confirmationThresholdCents }
            : {}),
          updatedAt: new Date()
        })
        .where(eq(schema.teams.id, team.id));
    }

    if (body.captainUserId) {
      await this.assignCaptainTx(team.id, body.captainUserId);
    }

    // Re-fetch so the returned DTO reflects the captain + threshold.
    const dto = await this.getH.execute({ id: team.id });
    return this.enrichWithLifecycle(dto);
  }

  @Patch(":id")
  @AllowScopedWrite()
  async update(
    @Param("id") id: string,
    @Body() body: UpdateTeamBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<TeamDto> {
    const [team] = await this.db
      .select({ orgId: schema.teams.orgId })
      .from(schema.teams)
      .where(eq(schema.teams.id, id))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    // Who may edit (SETUP-2): an org-level grant with team.* on the team's
    // org (org admin) edits every field; a team-level grant (captain) edits
    // branding only. A league grant does not cover org-owned teams.
    const shape = (teamId: string) => ({
      id,
      orgId: team.orgId,
      leagueId: "",
      seasonId: null,
      divisionId: null,
      homeTeamId: teamId,
      awayTeamId: teamId
    });
    const orgAccess = await accessForScope(this.db, user.userId, shape(""));
    const orgAdmin = scope.isSuperAdmin || scope.leagueIds === null || accessCan(orgAccess, "team.update");
    const allowed =
      orgAdmin ||
      accessCan(await accessForScope(this.db, user.userId, shape(id)), "team.update") ||
      (scope.teamIds?.includes(id) ?? false);
    if (!allowed) throw new NotFoundException("Team not found");

    // Core fields go through the domain handler. Captain-scoped users
    // (captain / captain) get their team-profile edits via this
    // path — same dual-role pattern as before.
    await this.updateH.execute({
      id,
      name: body.name,
      shortName: body.shortName,
      logoUrl: body.logoUrl,
      colors: body.colors
    });

    // Workflow-7A extensions. Only super/org admins get to move the
    // threshold — captains can edit branding but not billing knobs.
    if (
      body.homeRink !== undefined ||
      body.confirmationThresholdCents !== undefined
    ) {
      const canEditAdminFields = orgAdmin;
      if (!canEditAdminFields && body.confirmationThresholdCents !== undefined) {
        throw new ForbiddenException(
          "Only org/league admins can change the confirmation threshold."
        );
      }
      await this.db
        .update(schema.teams)
        .set({
          ...(body.homeRink !== undefined
            ? {
                externalIds: homeRinkExternalIds(body.homeRink)
              }
            : {}),
          ...(body.confirmationThresholdCents !== undefined
            ? { confirmationThresholdCents: body.confirmationThresholdCents }
            : {}),
          updatedAt: new Date()
        })
        .where(eq(schema.teams.id, id));
    }

    const dto = await this.getH.execute({ id });
    return this.enrichWithLifecycle(dto);
  }

  @Delete(":id") dissolve(@Param("id") id: string): Promise<TeamDto> {
    return this.dissolveH.execute({ id });
  }

  // -------------------------------------------------------------------
  // Workflow 7A · Phase 1 — captain assignment + status transition
  // -------------------------------------------------------------------

  @Post(":id/captain")
  @ApiOperation({
    summary:
      "Assign / rotate the team captain. Two-write transaction: revoke the previous captain's role row, insert a new one, and update teams.captainUserId. Guard: super_admin / org_admin only (captains can't promote themselves)."
  })
  async assignCaptain(
    @Param("id") teamId: string,
    @Body() body: AssignCaptainBodyDto
  ): Promise<TeamDto> {
    const [team] = await this.db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    await this.assignCaptainTx(teamId, body.userId);
    const dto = await this.getH.execute({ id: teamId });
    return this.enrichWithLifecycle(dto);
  }

  @Patch(":id/status")
  @ApiOperation({
    summary:
      "Set the team's lifecycle status (active | dissolved). Dissolved teams cannot accept new division_team_entries."
  })
  async setStatus(
    @Param("id") teamId: string,
    @Body() body: SetTeamStatusBodyDto
  ): Promise<TeamDto> {
    const result = await this.db
      .update(schema.teams)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(schema.teams.id, teamId))
      .returning({ id: schema.teams.id });
    if (!result[0]) throw new NotFoundException("Team not found");
    const dto = await this.getH.execute({ id: teamId });
    return this.enrichWithLifecycle(dto);
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Load workflow-7A fields (captainUserId, confirmationThresholdCents,
   * homeRink, colors) for a batch of team ids. Returned as a map so the
   * caller can splice them into the domain DTOs that the handler emits.
   */
  private async loadLifecycle(teamIds: string[]): Promise<
    Map<
      string,
      {
        captainUserId: string | null;
        confirmationThresholdCents: number;
        homeRink: string | null;
        colors: Record<string, unknown>;
        ownerOrgName: string | null;
        captainName: string | null;
      }
    >
  > {
    if (teamIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: schema.teams.id,
        captainUserId: schema.teams.captainUserId,
        confirmationThresholdCents: schema.teams.confirmationThresholdCents,
        externalIds: schema.teams.externalIds,
        colors: schema.teams.colors,
        ownerOrgName: schema.orgs.displayName,
        captainDisplayName: schema.profiles.displayName,
        captainEmail: schema.profiles.email
      })
      .from(schema.teams)
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.teams.orgId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.teams.captainUserId))
      .where(inArray(schema.teams.id, teamIds));
    const out = new Map<
      string,
      {
        captainUserId: string | null;
        confirmationThresholdCents: number;
        homeRink: string | null;
        colors: Record<string, unknown>;
        ownerOrgName: string | null;
        captainName: string | null;
      }
    >();
    for (const r of rows) {
      const external = (r.externalIds as Record<string, unknown>) ?? {};
      out.set(r.id, {
        captainUserId: r.captainUserId ?? null,
        confirmationThresholdCents: r.confirmationThresholdCents ?? 0,
        homeRink: (external.homeRink as string | null | undefined) ?? null,
        colors: (r.colors as Record<string, unknown>) ?? {},
        ownerOrgName: r.ownerOrgName ?? null,
        captainName: r.captainDisplayName || r.captainEmail || null
      });
    }
    return out;
  }

  private mergeLifecycle(
    dto: TeamDto,
    extras:
      | {
          captainUserId: string | null;
          confirmationThresholdCents: number;
          homeRink: string | null;
          colors: Record<string, unknown>;
          ownerOrgName: string | null;
          captainName: string | null;
        }
      | undefined
  ): TeamDto {
    if (!extras) return dto;
    return {
      ...dto,
      captainUserId: extras.captainUserId,
      confirmationThresholdCents: extras.confirmationThresholdCents,
      homeRink: extras.homeRink,
      colors: extras.colors,
      ownerOrgName: extras.ownerOrgName,
      captainName: extras.captainName
    };
  }

  private async enrichWithLifecycle(dto: TeamDto): Promise<TeamDto> {
    const map = await this.loadLifecycle([dto.id]);
    return this.mergeLifecycle(dto, map.get(dto.id));
  }

  /**
   * Captain assignment transaction. Three writes:
   *   1. Revoke any current captain role row for this team (set
   *      revokedAt = now), so the audit trail keeps every reign.
   *   2. Insert a new user_role_assignments row for the new captain.
   *   3. Update teams.captainUserId (denormalised fast lookup).
   *
   * If any step throws, Drizzle's transaction wrapper rolls back.
   */
  private async assignCaptainTx(teamId: string, userId: string): Promise<void> {
    // Resolve the captain role id (system role catalog).
    const [captainRole] = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, "captain"))
      .limit(1);
    if (!captainRole) {
      throw new NotFoundException(
        "captain role not seeded — run pnpm --filter @sportspulse/db seed first"
      );
    }

    // Resolve the team's current season + the persons.id for the
    // new captain so the roster_moves audit rows have full context.
    const previousCaptainUserId = await this.loadCurrentCaptainUserId(teamId);
    const currentSeasonId = await this.loadActiveSeasonId(teamId);
    const newCaptainPersonId = await this.loadPersonIdForUser(userId);
    const previousCaptainPersonId = previousCaptainUserId
      ? await this.loadPersonIdForUser(previousCaptainUserId)
      : null;

    await this.db.transaction(async (tx) => {
      // 1. Revoke any active captain on this team.
      await tx
        .update(schema.userRoleAssignments)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.userRoleAssignments.roleId, captainRole.id),
            eq(schema.userRoleAssignments.scopeType, "team"),
            eq(schema.userRoleAssignments.scopeId, teamId),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );

      // 2. Grant the new captain. effectiveFrom defaults to now().
      await tx.insert(schema.userRoleAssignments).values({
        userId,
        roleId: captainRole.id,
        scopeType: "team",
        scopeId: teamId
      });

      // 3. Denormalised pointer on teams.
      await tx
        .update(schema.teams)
        .set({ captainUserId: userId, updatedAt: new Date() })
        .where(eq(schema.teams.id, teamId));

      // 4. Workflow 7B · Case 8 — append-only audit on roster_moves.
      //    Skip when no current season is on file (team in off-season).
      if (currentSeasonId && newCaptainPersonId) {
        if (previousCaptainPersonId) {
          await tx.insert(schema.rosterMoves).values({
            teamId,
            personId: previousCaptainPersonId,
            seasonId: currentSeasonId,
            moveType: "captain_revoke",
            membershipType: "primary",
            effectiveAt: new Date(),
            metadata: { previousCaptainUserId }
          });
        }
        await tx.insert(schema.rosterMoves).values({
          teamId,
          personId: newCaptainPersonId,
          seasonId: currentSeasonId,
          moveType: "captain_assign",
          membershipType: "primary",
          effectiveAt: new Date(),
          metadata: { previousCaptainUserId, newCaptainUserId: userId }
        });
      }
    });
  }

  private async loadCurrentCaptainUserId(
    teamId: string
  ): Promise<string | null> {
    const [t] = await this.db
      .select({ captainUserId: schema.teams.captainUserId })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    return t?.captainUserId ?? null;
  }

  private async loadActiveSeasonId(teamId: string): Promise<string | null> {
    const rows = await this.db
      .select({ seasonId: schema.divisions.seasonId })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
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
      .orderBy(sql`${schema.divisions.createdAt} DESC`)
      .limit(1);
    return rows[0]?.seasonId ?? null;
  }

  private async loadPersonIdForUser(userId: string): Promise<string | null> {
    const [p] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    return p?.id ?? null;
  }
}
