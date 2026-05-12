import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { GetCurrentUserHandler } from "../application/queries/get-current-user.query";
import { ListProfilesHandler } from "../application/queries/list-profiles.query";
import { SuspendProfileHandler } from "../application/commands/suspend-profile.command";
import { ReactivateProfileHandler } from "../application/commands/reactivate-profile.command";
import { UpdateProfileHandler } from "../application/commands/update-profile.command";
import {
  InviteUserHandler,
  type InviteUserResult
} from "../application/commands/invite-user.command";
import { SetUserPasswordHandler } from "../application/commands/set-user-password.command";
import { SetRoleProfileHandler } from "../application/commands/set-role-profile.command";
import { GetRoleProfileHandler } from "../application/queries/get-role-profile.query";
import { ProfileDto, ProfilePageDto } from "../application/dtos/profile.dto";
import { ListProfilesQueryDto } from "./dto/list-profiles.query-dto";
import { UpdateProfileBodyDto } from "./dto/update-profile.body-dto";
import { InviteUserBodyDto } from "./dto/invite-user.body-dto";
import { SetUserPasswordBodyDto } from "./dto/set-user-password.body-dto";
import { SetRoleProfileBodyDto } from "./dto/set-role-profile.body-dto";

@ApiTags("iam")
@ApiBearerAuth()
@Controller("iam")
@UseGuards(JwtAuthGuard)
export class IamController {
  constructor(
    private readonly getCurrentUser: GetCurrentUserHandler,
    private readonly listProfiles: ListProfilesHandler,
    private readonly suspendProfile: SuspendProfileHandler,
    private readonly reactivateProfile: ReactivateProfileHandler,
    private readonly updateProfile: UpdateProfileHandler,
    private readonly inviteUser: InviteUserHandler,
    private readonly setUserPassword: SetUserPasswordHandler,
    private readonly setRoleProfile: SetRoleProfileHandler,
    private readonly getRoleProfile: GetRoleProfileHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // -------- self --------

  @Get("me")
  @ApiOperation({ summary: "Get current authenticated user's profile" })
  async me(@CurrentUser() principal: AuthPrincipal): Promise<ProfileDto> {
    return this.getCurrentUser.execute({ userId: principal.userId });
  }

  @Patch("me")
  @ApiOperation({
    summary:
      "Patch the current user's own profile. Used by the sign-up funnel + role-targeted apps so a freshly-created user can fill in their identity fields without admin help."
  })
  async patchMe(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: UpdateProfileBodyDto
  ): Promise<ProfileDto> {
    return this.updateProfile.execute({ userId: principal.userId, ...body });
  }

  @Get("me/scope")
  @ApiOperation({
    summary:
      "Resolve the current user's role + scope summary. Used by the role-targeted apps (org-admin-web, team-admin-web, player-web) to know which org/team to render the home page against."
  })
  async meScope(@CurrentUser() principal: AuthPrincipal): Promise<{
    userId: string;
    isSuperAdmin: boolean;
    roleCodes: string[];
    orgIds: string[];
    leagueIds: string[];
    teamIds: string[];
    personId: string | null;
  }> {
    // Reuses the same projection as loadUserScope but returns the raw
    // direct assignments alongside the projected sets — the apps need
    // both ("which team am I on?" vs "which orgs can I read?").
    const [profile] = await this.db
      .select({ isSuperAdmin: schema.profiles.isSuperAdmin })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, principal.userId))
      .limit(1);

    const assignments = await this.db
      .select({
        scopeType: schema.userRoleAssignments.scopeType,
        scopeId: schema.userRoleAssignments.scopeId,
        roleCode: schema.roles.code
      })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, principal.userId),
          sql`${schema.userRoleAssignments.revokedAt} IS NULL`
        )
      );

    let [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);

    // Heal-on-read for legacy registrations: the public funnel used to
    // create persons with `externalIds.supabaseUserId` set but
    // `persons.userId` left null, which left the player dashboard
    // stuck on "Finish onboarding first". If we find such a row,
    // claim it for this user now so future reads are direct.
    if (!person) {
      const [orphan] = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
          and(
            sql`${schema.persons.userId} IS NULL`,
            sql`${schema.persons.externalIds}->>'supabaseUserId' = ${principal.userId}`
          )
        )
        .limit(1);
      if (orphan) {
        await this.db
          .update(schema.persons)
          .set({ userId: principal.userId, updatedAt: new Date() })
          .where(eq(schema.persons.id, orphan.id));
        person = { id: orphan.id };
      }
    }

    // Dedupe per scope dimension — a user holding multiple roles on
    // the same team (e.g. team_admin + coach) should count as one team
    // for UI purposes ("· 1 team", not "· 2 teams").
    const dedupe = (xs: string[]) => Array.from(new Set(xs));
    return {
      userId: principal.userId,
      isSuperAdmin: profile?.isSuperAdmin ?? false,
      roleCodes: dedupe(assignments.map((a) => a.roleCode)),
      orgIds: dedupe(
        assignments
          .filter((a) => a.scopeType === "org" && a.scopeId)
          .map((a) => a.scopeId as string)
      ),
      leagueIds: dedupe(
        assignments
          .filter((a) => a.scopeType === "league" && a.scopeId)
          .map((a) => a.scopeId as string)
      ),
      teamIds: dedupe(
        assignments
          .filter((a) => a.scopeType === "team" && a.scopeId)
          .map((a) => a.scopeId as string)
      ),
      personId: person?.id ?? null
    };
  }

  // -------- super admin --------

  @Get("users")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "List users (super admin only)" })
  async list(@Query() q: ListProfilesQueryDto): Promise<ProfilePageDto> {
    return this.listProfiles.execute(q);
  }

  @Get("users/:id")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Get a user's profile (super admin only)" })
  async getOne(@Param("id") id: string): Promise<ProfileDto> {
    return this.getCurrentUser.execute({ userId: id });
  }

  @Get("users/:id/memberships")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Team memberships for a user — every team_memberships row joined through persons.user_id, enriched with team / org / season / division names so the user detail page can show 'which teams + divisions is this person on'."
  })
  async memberships(@Param("id") id: string): Promise<{
    items: Array<{
      membershipId: string;
      teamId: string;
      teamName: string;
      teamShortName: string | null;
      orgId: string;
      orgName: string;
      seasonId: string;
      seasonName: string;
      seasonStatus: string;
      divisionId: string | null;
      divisionName: string | null;
      divisionEntryStatus: string | null;
      membershipType: string;
      jerseyNumber: number | null;
      positionCode: string | null;
      currentStatus: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }>;
  }> {
    // Resolve the person record bound to this auth user. Without a
    // person row we have no roster footprint, so return empty.
    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, id))
      .limit(1);
    if (!person) return { items: [] };

    const rows = await this.db
      .select({
        membershipId: schema.teamMemberships.id,
        membershipType: schema.teamMemberships.membershipType,
        jerseyNumber: schema.teamMemberships.jerseyNumber,
        positionCode: schema.teamMemberships.positionCode,
        currentStatus: schema.teamMemberships.currentStatus,
        effectiveFrom: schema.teamMemberships.effectiveFrom,
        effectiveTo: schema.teamMemberships.effectiveTo,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        teamShortName: schema.teams.shortName,
        orgId: schema.teams.orgId,
        orgName: schema.orgs.displayName,
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        seasonStatus: schema.seasons.status
      })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.teamMemberships.teamId)
      )
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.teams.orgId))
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.teamMemberships.seasonId)
      )
      .where(eq(schema.teamMemberships.personId, person.id))
      .orderBy(desc(schema.teamMemberships.effectiveFrom));

    if (rows.length === 0) return { items: [] };

    // Resolve the division the team played in per season via
    // division_team_entries. A team can have multiple entries per
    // season in theory; pick the one in the most-progressed status
    // (confirmed > accepted > applied > pending_approval).
    const teamIds = Array.from(new Set(rows.map((r) => r.teamId)));
    const entries = await this.db
      .select({
        teamId: schema.divisionTeamEntries.teamId,
        seasonId: schema.divisions.seasonId,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(inArray(schema.divisionTeamEntries.teamId, teamIds));

    const STATUS_RANK: Record<string, number> = {
      confirmed: 4,
      accepted: 3,
      applied: 2,
      pending_approval: 1
    };
    const byTeamSeason = new Map<
      string,
      {
        entryStatus: string;
        divisionId: string;
        divisionName: string;
      }
    >();
    for (const e of entries) {
      const key = `${e.teamId}::${e.seasonId}`;
      const current = byTeamSeason.get(key);
      const rank = STATUS_RANK[e.entryStatus] ?? 0;
      if (!current || rank > (STATUS_RANK[current.entryStatus] ?? 0)) {
        byTeamSeason.set(key, {
          entryStatus: e.entryStatus,
          divisionId: e.divisionId,
          divisionName: e.divisionName
        });
      }
    }

    return {
      items: rows.map((r) => {
        const key = `${r.teamId}::${r.seasonId}`;
        const entry = byTeamSeason.get(key) ?? null;
        return {
          membershipId: r.membershipId,
          teamId: r.teamId,
          teamName: r.teamName,
          teamShortName: r.teamShortName ?? null,
          orgId: r.orgId,
          orgName: r.orgName,
          seasonId: r.seasonId,
          seasonName: r.seasonName,
          seasonStatus: r.seasonStatus,
          divisionId: entry?.divisionId ?? null,
          divisionName: entry?.divisionName ?? null,
          divisionEntryStatus: entry?.entryStatus ?? null,
          membershipType: r.membershipType,
          jerseyNumber: r.jerseyNumber ?? null,
          positionCode: r.positionCode ?? null,
          currentStatus: r.currentStatus,
          effectiveFrom: r.effectiveFrom.toISOString(),
          effectiveTo: r.effectiveTo?.toISOString() ?? null
        };
      })
    };
  }

  @Patch("users/:id")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Update a user's profile (super admin only)" })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateProfileBodyDto
  ): Promise<ProfileDto> {
    return this.updateProfile.execute({ userId: id, ...body });
  }

  @Post("users/:id/suspend")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Suspend a user (super admin only)" })
  async suspend(@Param("id") id: string): Promise<ProfileDto> {
    return this.suspendProfile.execute({ userId: id });
  }

  @Post("users/:id/reactivate")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Reactivate a suspended user (super admin only)" })
  async reactivate(@Param("id") id: string): Promise<ProfileDto> {
    return this.reactivateProfile.execute({ userId: id });
  }

  @Post("users/invite")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Invite a user by email; optionally assign a role at the same time. Reused by every 'Assign admin' surface."
  })
  async invite(
    @Body() body: InviteUserBodyDto,
    @CurrentUser() principal: AuthPrincipal
  ): Promise<InviteUserResult> {
    return this.inviteUser.execute({
      email: body.email,
      displayName: body.displayName ?? null,
      role: body.role
        ? {
            roleCode: body.role.roleCode,
            scopeType: body.role.scopeType,
            scopeId: body.role.scopeId ?? null
          }
        : undefined,
      password: body.password ?? null,
      scopeLabel: body.scopeLabel ?? null,
      // Inviter display name is best-effort: fetched from the principal's
      // own profile so the rendered message signature reads naturally.
      inviterDisplayName:
        (await this.getCurrentUser
          .execute({ userId: principal.userId })
          .catch(() => null))?.displayName ?? null,
      invitedByUserId: principal.userId
    });
  }

  @Post("users/:id/set-password")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Force-set a user's password (super admin only). Used when admin needs to share temporary credentials with the user out-of-band."
  })
  async setPassword(
    @Param("id") id: string,
    @Body() body: SetUserPasswordBodyDto
  ): Promise<{ ok: true }> {
    await this.setUserPassword.execute({
      userId: id,
      password: body.password
    });
    return { ok: true };
  }

  @Get("users/:id/role-profile")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Read a user's role-specific profile JSONB. Pass ?code=<roleCode>; returns {} if unset."
  })
  async readRoleProfile(
    @Param("id") id: string,
    @Query("code") code: string
  ): Promise<{ data: Record<string, unknown> }> {
    return this.getRoleProfile.execute({ userId: id, roleCode: code });
  }

  @Patch("users/:id/role-profile")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Update the role-specific profile JSONB stored on profiles.metadata.roleProfile.<roleCode>. Schema is defined by @sportspulse/kernel ROLE_PROFILE_SCHEMAS."
  })
  async putRoleProfile(
    @Param("id") id: string,
    @Body() body: SetRoleProfileBodyDto
  ): Promise<{ ok: true }> {
    await this.setRoleProfile.execute({
      userId: id,
      roleCode: body.roleCode,
      data: body.data,
      complete: body.complete
    });
    return { ok: true };
  }

  @Get("role-profile-form")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      "Resolve the role-profile FormDefinition for a given role code. Looks up registration_forms with purpose=role_profile + applies_to_roles containing the code. Returns { source: 'admin' | 'kernel-default', schema, formVersionId? }; the caller (RoleProfileDialog) falls through to ROLE_PROFILE_SCHEMAS in @sportspulse/kernel when source is 'kernel-default'."
  })
  async getRoleProfileForm(@Query("code") code: string): Promise<{
    source: "admin" | "kernel-default";
    schema: Record<string, unknown> | null;
    formVersionId: string | null;
  }> {
    if (!code) return { source: "kernel-default", schema: null, formVersionId: null };
    const [row] = await this.db
      .select({
        schema: schema.registrationFormVersions.schema,
        formVersionId: schema.registrationFormVersions.id
      })
      .from(schema.registrationFormVersions)
      .innerJoin(
        schema.registrationForms,
        eq(
          schema.registrationForms.id,
          schema.registrationFormVersions.formId
        )
      )
      .where(
        and(
          eq(schema.registrationFormVersions.locked, true),
          eq(schema.registrationForms.purpose, "role_profile"),
          // applies_to_roles is a text[] column — uses && (overlap) so
          // a form tagged ['player','free_agent'] matches either code.
          sql`${schema.registrationForms.appliesToRoles} && ARRAY[${code}]::text[]`
        )
      )
      .orderBy(desc(schema.registrationFormVersions.publishedAt))
      .limit(1);
    if (row) {
      return {
        source: "admin",
        schema: row.schema as Record<string, unknown>,
        formVersionId: row.formVersionId
      };
    }
    return { source: "kernel-default", schema: null, formVersionId: null };
  }
}
