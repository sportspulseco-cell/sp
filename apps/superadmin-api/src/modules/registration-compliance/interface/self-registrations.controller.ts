import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { RegistrationDto } from "../application/dtos/registration.dto";

/**
 * Self-service registration endpoints. The admin counterpart in
 * RegistrationsController is gated by SuperAdminGuard; this controller
 * runs with JwtAuthGuard alone and only ever returns rows whose
 * subjectPersonId matches the caller's linked person record.
 *
 * Players hit this from /registrations on the player-web app to see
 * their own submissions across leagues.
 */
// DTO declared BEFORE the controller so the @Body() decorator can read
// it at module-load time. Defining it after the controller class hits
// a class TDZ ReferenceError under swc/Vercel runtime — that broke the
// whole sp-api function with FUNCTION_INVOCATION_FAILED on 2026-05-16.
class SetDivisionBodyDto {
  @IsUUID() divisionId!: string;
}

@ApiTags("registration/self")
@ApiBearerAuth()
@Controller("registration/self")
@UseGuards(JwtAuthGuard)
export class SelfRegistrationsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get("registrations")
  @ApiOperation({
    summary:
      "List the caller's own registrations (filtered by their linked persons.id), enriched with form / org / season / league / division / team names so the player can see *what* they registered for, not just the ref id. Heals legacy rows that pre-dated the persons.userId backfill by claiming any orphan person whose externalIds.supabaseUserId matches."
  })
  async listMine(
    @CurrentUser() principal: AuthPrincipal
  ): Promise<{ items: RegistrationDto[] }> {
    let [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);

    // Heal-on-read for legacy registrations: the public funnel used to
    // create persons with externalIds.supabaseUserId set but
    // persons.userId left null. Adopt those orphans here so the user's
    // full history surfaces on first call.
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

    if (!person) return { items: [] };

    const rows = await this.db
      .select({
        r: schema.registrations,
        orgName: schema.orgs.displayName,
        formName: schema.registrationForms.name,
        formSeasonId: schema.registrationForms.seasonId,
        divisionSeasonId: schema.divisions.seasonId,
        leagueName: schema.leagues.name,
        divisionName: schema.divisions.name,
        teamName: schema.teams.name
      })
      .from(schema.registrations)
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.registrations.orgId))
      .leftJoin(
        schema.registrationFormVersions,
        eq(
          schema.registrationFormVersions.id,
          schema.registrations.formVersionId
        )
      )
      .leftJoin(
        schema.registrationForms,
        eq(
          schema.registrationForms.id,
          schema.registrationFormVersions.formId
        )
      )
      .leftJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.registrations.leagueId)
      )
      .leftJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.registrations.divisionId)
      )
      .leftJoin(
        schema.teams,
        eq(schema.teams.id, schema.registrations.teamId)
      )
      .where(eq(schema.registrations.subjectPersonId, person.id))
      .orderBy(desc(schema.registrations.createdAt))
      .limit(100);

    // Resolve season name from either the division's season or the
    // form's season (whichever we end up surfacing per-row). Done in
    // one round-trip rather than per-row to keep the query simple.
    const seasonIds = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.divisionSeasonId, row.formSeasonId])
          .filter((x): x is string => !!x)
      )
    );
    const seasonRows = seasonIds.length
      ? await this.db
          .select({ id: schema.seasons.id, name: schema.seasons.name })
          .from(schema.seasons)
          .where(inArray(schema.seasons.id, seasonIds))
      : [];
    const seasonName = new Map(seasonRows.map((s) => [s.id, s.name]));

    return {
      items: rows.map(({ r, orgName, formName, formSeasonId, divisionSeasonId, leagueName, divisionName, teamName }) => {
        // Prefer the division's season (most specific) over the form's
        // season (the form may cover multiple seasons via division
        // scoping). Falls back to formSeasonId for org/league-scoped
        // forms that aren't bound to a single division.
        const seasonId = divisionSeasonId ?? formSeasonId ?? null;
        return {
          id: r.id,
          idempotencyKey: r.idempotencyKey,
          orgId: r.orgId,
          formVersionId: r.formVersionId,
          submittedByUserId: r.submittedByUserId,
          subjectPersonId: r.subjectPersonId,
          status: r.status as RegistrationDto["status"],
          leagueId: r.leagueId,
          divisionId: r.divisionId,
          seasonId,
          teamId: r.teamId,
          submittedAt: r.submittedAt?.toISOString() ?? null,
          reviewedByUserId: r.reviewedByUserId,
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          decisionReason: r.decisionReason,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          orgName: orgName ?? null,
          formName: formName ?? null,
          seasonName: seasonId ? seasonName.get(seasonId) ?? null : null,
          leagueName: leagueName ?? null,
          divisionName: divisionName ?? null,
          teamName: teamName ?? null
        };
      }) as unknown as RegistrationDto[]
    };
  }

  @Get("registrations/:id")
  @ApiOperation({
    summary:
      "Single self-scoped registration with the same enrichment as listMine. Returns 404 (never 403) when the row exists but doesn't belong to the caller — never leak existence across users."
  })
  async getMine(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string
  ): Promise<RegistrationDto> {
    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);
    if (!person) throw new NotFoundException("Registration not found");

    const [row] = await this.db
      .select({
        r: schema.registrations,
        orgName: schema.orgs.displayName,
        formName: schema.registrationForms.name,
        formSeasonId: schema.registrationForms.seasonId,
        divisionSeasonId: schema.divisions.seasonId,
        leagueName: schema.leagues.name,
        divisionName: schema.divisions.name,
        teamName: schema.teams.name
      })
      .from(schema.registrations)
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.registrations.orgId))
      .leftJoin(
        schema.registrationFormVersions,
        eq(
          schema.registrationFormVersions.id,
          schema.registrations.formVersionId
        )
      )
      .leftJoin(
        schema.registrationForms,
        eq(
          schema.registrationForms.id,
          schema.registrationFormVersions.formId
        )
      )
      .leftJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.registrations.leagueId)
      )
      .leftJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.registrations.divisionId)
      )
      .leftJoin(
        schema.teams,
        eq(schema.teams.id, schema.registrations.teamId)
      )
      .where(eq(schema.registrations.id, id))
      .limit(1);

    if (!row) throw new NotFoundException("Registration not found");
    if (row.r.subjectPersonId !== person.id) {
      // Row exists but isn't theirs — 404, not 403, to avoid leaking
      // that the registration exists at all.
      throw new NotFoundException("Registration not found");
    }

    // Prefer division's season (most specific) over form's season —
    // see listMine for the rationale.
    const seasonId = row.divisionSeasonId ?? row.formSeasonId ?? null;
    let seasonName: string | null = null;
    if (seasonId) {
      const [s] = await this.db
        .select({ name: schema.seasons.name })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, seasonId))
        .limit(1);
      seasonName = s?.name ?? null;
    }

    // P2-2 legacy-row follow-up: when the registration has a season
    // but no division, surface the season's divisions so the player
    // can pick one inline on the detail page.
    let availableDivisions:
      | Array<{ id: string; name: string; tier: string | null }>
      | null = null;
    if (seasonId && !row.r.divisionId) {
      availableDivisions = await this.db
        .select({
          id: schema.divisions.id,
          name: schema.divisions.name,
          tier: schema.divisions.tier
        })
        .from(schema.divisions)
        .where(eq(schema.divisions.seasonId, seasonId))
        .orderBy(asc(schema.divisions.tier));
    }

    const r = row.r;
    return {
      id: r.id,
      idempotencyKey: r.idempotencyKey,
      orgId: r.orgId,
      formVersionId: r.formVersionId,
      submittedByUserId: r.submittedByUserId,
      subjectPersonId: r.subjectPersonId,
      status: r.status as RegistrationDto["status"],
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      seasonId,
      teamId: r.teamId,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      reviewedByUserId: r.reviewedByUserId,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      decisionReason: r.decisionReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      orgName: row.orgName ?? null,
      formName: row.formName ?? null,
      seasonName,
      leagueName: row.leagueName ?? null,
      divisionName: row.divisionName ?? null,
      teamName: row.teamName ?? null,
      availableDivisions
    } as unknown as RegistrationDto;
  }

  /**
   * Self-service assignment of a division on an existing registration
   * that pre-dates the P2-2 funnel division step. Validates that:
   *   - the registration belongs to the caller
   *   - the chosen division belongs to the registration's season
   * Once set, the partial unique index on (subject_person_id, season_id)
   * — which already permits this row — continues to protect against
   * duplicate active rows for the same player+season.
   */
  @Patch("registrations/:id/division")
  @ApiOperation({
    summary:
      "Assign a division to the caller's own legacy registration. 404 if the row isn't theirs; 409 if the division doesn't belong to the registration's season."
  })
  async setMineDivision(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: SetDivisionBodyDto
  ): Promise<{ id: string; divisionId: string }> {
    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);
    if (!person) throw new NotFoundException("Registration not found");

    const [reg] = await this.db
      .select({
        id: schema.registrations.id,
        subjectPersonId: schema.registrations.subjectPersonId,
        formVersionId: schema.registrations.formVersionId,
        seasonId: schema.registrations.seasonId
      })
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!reg) throw new NotFoundException("Registration not found");
    if (reg.subjectPersonId !== person.id) {
      throw new NotFoundException("Registration not found");
    }

    // Resolve the registration's season — column first, form fallback.
    let resolvedSeasonId: string | null = reg.seasonId;
    if (!resolvedSeasonId) {
      const [fv] = await this.db
        .select({ formId: schema.registrationFormVersions.formId })
        .from(schema.registrationFormVersions)
        .where(eq(schema.registrationFormVersions.id, reg.formVersionId))
        .limit(1);
      if (fv?.formId) {
        const [form] = await this.db
          .select({ seasonId: schema.registrationForms.seasonId })
          .from(schema.registrationForms)
          .where(eq(schema.registrationForms.id, fv.formId))
          .limit(1);
        resolvedSeasonId = form?.seasonId ?? null;
      }
    }

    const [division] = await this.db
      .select({ seasonId: schema.divisions.seasonId })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, body.divisionId))
      .limit(1);
    if (!division) {
      throw new NotFoundException("Division not found");
    }
    if (resolvedSeasonId && division.seasonId !== resolvedSeasonId) {
      throw new ConflictException({
        error: "division_season_mismatch",
        message:
          "That division belongs to a different season than this registration."
      });
    }

    await this.db
      .update(schema.registrations)
      .set({
        divisionId: body.divisionId,
        seasonId: division.seasonId,
        updatedAt: new Date()
      })
      .where(eq(schema.registrations.id, id));

    return { id, divisionId: body.divisionId };
  }
}
