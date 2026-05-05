import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength
} from "class-validator";
import { eq, and } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { RegistrationV2Service } from "../application/registration-v2.service";

class StartSubmissionBodyDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pricingTierId?: string;

  /** Path the registrant is on. */
  @ApiPropertyOptional({ enum: ["team", "individual", "free_agent", "captain_invite"] })
  @IsOptional()
  @IsString()
  submissionType?: "team" | "individual" | "free_agent" | "captain_invite";

  /** Free-form answers to custom form questions (kernel FormDefinition shape). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

/**
 * Public, anonymous endpoints for the player registration funnel.
 *
 * Spec: Workflow 1 v2. NO auth — any visitor can fetch a season's
 * registration shape and start a draft submission. The draft is bound
 * to a user account when they complete the Account step.
 *
 * Resource bound is the season — by ID for now; slug support comes when
 * we add `seasons.slug`.
 */
@ApiTags("public/registration")
@Controller("public/registration")
export class PublicRegistrationController {
  constructor(
    private readonly v2: RegistrationV2Service,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get("seasons/:id")
  @ApiOperation({
    summary:
      "Fetch a season's public registration context: season meta, active pricing tiers, active form definition."
  })
  async getSeasonContext(@Param("id") id: string) {
    const [season] = await this.db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, id))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    const tiers = await this.v2.listPricingTiers({ seasonId: id });

    // For now, find an active form linked at season scope by best-effort
    // lookup. Wave E will pin this to a `season.form_id` column. Returns
    // an empty FormDefinition if none configured.
    const [formVersion] = await this.db
      .select({
        id: schema.registrationFormVersions.id,
        schema: schema.registrationFormVersions.schema,
        formId: schema.registrationFormVersions.formId,
        publishedAt: schema.registrationFormVersions.publishedAt
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
          eq(schema.registrationForms.scope, "league")
        )
      )
      .limit(1);

    return {
      season: {
        id: season.id,
        name: season.name,
        sportCode: season.sportCode,
        startDate: season.startDate,
        endDate: season.endDate,
        registrationOpensAt: season.registrationOpensAt,
        registrationClosesAt: season.registrationClosesAt,
        rosterLockAt: season.rosterLockAt,
        status: season.status
      },
      pricingTiers: tiers.filter((t) => t.isActive),
      formVersionId: formVersion?.id ?? null,
      formDefinition: formVersion?.schema ?? { schemaVersion: 1, questions: [] }
    };
  }

  @Post("seasons/:id/submissions")
  @ApiOperation({
    summary:
      "Start a draft registration submission. Idempotent on (email, season). Returns the submission id; the funnel polls /confirmation later."
  })
  async startSubmission(
    @Param("id") seasonId: string,
    @Body() body: StartSubmissionBodyDto
  ) {
    const [season] = await this.db
      .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    // Idempotency key: email + season + path. Re-submitting the form
    // resumes the same draft.
    const idempotencyKey = `${body.email.toLowerCase()}|${seasonId}|${
      body.submissionType ?? "individual"
    }`;

    // Persist as `registrations` (existing v1 table). The relational
    // person_id is left NULL until the Account step binds the draft to
    // a real auth user.
    const [existing] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return { id: existing.id, status: existing.status, resumed: true };
    }

    // Need a placeholder person + form_version for the FK. For Wave D,
    // we mint a person row keyed off the email so the draft can persist
    // before the user account is created. (Cleanup pass: collapse to a
    // proper draft table in Wave E.)
    const [person] = await this.db
      .insert(schema.persons)
      .values({
        legalFirstName: body.fullName?.split(" ")[0] ?? "Pending",
        legalLastName: body.fullName?.split(" ").slice(1).join(" ") || "Registrant",
        externalIds: { email: body.email.toLowerCase() }
      })
      .returning();

    // Need at least one form_version to attach. Pick the first active one
    // for this org or fall back gracefully.
    const [anyVersion] = await this.db
      .select()
      .from(schema.registrationFormVersions)
      .limit(1);
    if (!anyVersion) {
      throw new NotFoundException(
        "No registration form is configured. Admin must create a form before opening registration."
      );
    }

    const [reg] = await this.db
      .insert(schema.registrations)
      .values({
        idempotencyKey,
        orgId: season.orgId,
        formVersionId: anyVersion.id,
        subjectPersonId: person!.id,
        status: "draft",
        metadata: {
          submissionType: body.submissionType ?? "individual",
          pricingTierId: body.pricingTierId ?? null,
          email: body.email.toLowerCase(),
          fullName: body.fullName ?? null,
          answers: body.answers ?? {}
        }
      })
      .returning();

    return { id: reg!.id, status: reg!.status, resumed: false };
  }
}
