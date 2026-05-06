import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength
} from "class-validator";
import { eq, and } from "drizzle-orm";
import {
  assertValidTransition,
  isRegistrationState,
  type RegistrationState
} from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { SupabaseAdminService } from "../../../shared/auth/supabase-admin.service";
import { RegistrationV2Service } from "../application/registration-v2.service";

class StartSubmissionBodyDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  /**
   * Password chosen at the Account step. Min 8 chars per spec §4.1.
   * Backend creates the Supabase auth user; mock-flow skips the
   * verification email roundtrip and marks email_confirm=true.
   */
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  /** ISO YYYY-MM-DD. Used for the minor-flag computation. */
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dobDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pricingTierId?: string;

  @ApiPropertyOptional({ enum: ["team", "individual", "free_agent", "captain_invite"] })
  @IsOptional()
  @IsString()
  submissionType?: "team" | "individual" | "free_agent" | "captain_invite";

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

/**
 * Public, anonymous endpoints for the player registration funnel.
 *
 * Spec: Workflow 1 v2.0. NO auth — the funnel runs before any user
 * account exists. The start endpoint creates a Supabase auth user
 * (email auto-confirmed for the mock flow) and binds the registration
 * to it. State transitions are guarded by the kernel state machine.
 *
 * Resource bound is the season — by ID for now; slug support comes when
 * we add `seasons.slug`.
 */
@ApiTags("public/registration")
@Controller("public/registration")
export class PublicRegistrationController {
  constructor(
    private readonly v2: RegistrationV2Service,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly supabase: SupabaseAdminService
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
      "Phase 1: account creation + Phase 2 details. Creates Supabase auth user, persons row, and registration row in the right state per kernel state machine. Idempotent on (email, season, path)."
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

    const email = body.email.trim().toLowerCase();
    const submissionType = body.submissionType ?? "individual";
    const idempotencyKey = `${email}|${seasonId}|${submissionType}`;

    // Phase 1.1 — find-or-create the Supabase auth user. Mock flow:
    // email_confirm=true so we don't depend on inbox roundtrip. Real
    // verification email comes when SUPABASE_REQUIRE_EMAIL_CONFIRM is
    // configured.
    const { userId, created: userCreated } =
      await this.supabase.inviteUserByEmail({
        email,
        displayName: body.fullName,
        password: body.password
      });

    // Phase 1.3 — minor evaluation. dob optional in this MVP since
    // the funnel's Account step doesn't always collect it; if absent
    // we treat as adult. Spec §6.2 says the parental flag adapts
    // retroactively when dob is later entered.
    const isMinor = body.dobDate ? computeIsMinor(body.dobDate) : false;

    // Find-or-create the persons row. Email goes into externalIds so
    // we can resume by email later.
    const existingPersonRow = await this.db
      .select()
      .from(schema.persons)
      .where(
        and(
          eq(schema.persons.legalFirstName, firstName(body.fullName)),
          eq(schema.persons.legalLastName, lastName(body.fullName))
        )
      )
      .limit(1);
    let personId = existingPersonRow[0]?.id;
    if (!personId) {
      const [person] = await this.db
        .insert(schema.persons)
        .values({
          legalFirstName: firstName(body.fullName),
          legalLastName: lastName(body.fullName),
          dobDate: body.dobDate ?? null,
          externalIds: { email, supabaseUserId: userId }
        })
        .returning();
      personId = person!.id;
    }

    // Need a form_version for the FK. Pick the first active one. Wave E
    // pins this to a season.formVersionId column.
    const [anyVersion] = await this.db
      .select()
      .from(schema.registrationFormVersions)
      .limit(1);
    if (!anyVersion) {
      throw new NotFoundException(
        "No registration form is configured. Admin must create a form before opening registration."
      );
    }

    // Resume support — if a draft already exists, return it instead
    // of creating a new one.
    const [existing] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      // Patch in any newly-supplied fields so the next page-load
      // reflects them. State only advances forward — drives by the
      // kernel state machine, not whatever the client claims.
      const merged = mergeMetadata(existing.metadata, {
        submissionType,
        pricingTierId: body.pricingTierId ?? null,
        email,
        fullName: body.fullName,
        phone: body.phone ?? null,
        dobDate: body.dobDate ?? null,
        answers: body.answers ?? {},
        isMinor
      });
      await this.db
        .update(schema.registrations)
        .set({
          submittedByUserId: userId,
          metadata: merged,
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, existing.id));
      return {
        id: existing.id,
        status: existing.status,
        resumed: true,
        userId,
        userCreated: false,
        isMinor
      };
    }

    // Initial state per spec §10. We auto-confirm email above (mock
    // flow), so we land in pending_consent for minors and
    // pending_payment for adults. If real email verification gets wired
    // in, change initial state to pending_verification and let the
    // verify endpoint advance it.
    const initialState: RegistrationState = isMinor
      ? "pending_consent"
      : "pending_payment";
    // Validate the transition draft → initial — this is informational
    // (we never actually persist `draft` first), but it documents the
    // path through the state machine.
    assertValidTransition("draft", initialState);

    const [reg] = await this.db
      .insert(schema.registrations)
      .values({
        idempotencyKey,
        orgId: season.orgId,
        formVersionId: anyVersion.id,
        submittedByUserId: userId,
        subjectPersonId: personId!,
        status: initialState,
        metadata: {
          submissionType,
          pricingTierId: body.pricingTierId ?? null,
          email,
          fullName: body.fullName,
          phone: body.phone ?? null,
          dobDate: body.dobDate ?? null,
          answers: body.answers ?? {},
          isMinor
        }
      })
      .returning();

    return {
      id: reg!.id,
      status: reg!.status,
      resumed: false,
      userId,
      userCreated,
      isMinor
    };
  }

  @Get("submissions/:id")
  @ApiOperation({
    summary:
      "Resume a submission. Caller must pass ?email= matching the row's stored email — there's no JWT here, this is the public funnel. Returns sanitised state for the funnel to repopulate from."
  })
  async getSubmission(
    @Param("id") id: string,
    @Query("email") email: string
  ) {
    if (!email) throw new NotFoundException("email query param required");
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Submission not found");
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    if ((meta.email as string)?.toLowerCase() !== email.trim().toLowerCase()) {
      // Don't leak whether the row exists — return 404 either way.
      throw new NotFoundException("Submission not found");
    }
    return {
      id: row.id,
      status: row.status,
      submissionType: meta.submissionType ?? "individual",
      pricingTierId: meta.pricingTierId ?? null,
      email: meta.email,
      fullName: meta.fullName ?? null,
      phone: meta.phone ?? null,
      dobDate: meta.dobDate ?? null,
      isMinor: meta.isMinor ?? false,
      answers: meta.answers ?? {}
    };
  }

  @Post("submissions/:id/cancel")
  @ApiOperation({
    summary:
      "Player-initiated cancellation. Validated by the kernel state machine — terminal/paid states block this and require admin intervention."
  })
  async cancelSubmission(
    @Param("id") id: string,
    @Body() body: { email: string }
  ) {
    const row = await this.loadAndAuthorize(id, body.email);
    if (!isRegistrationState(row.status)) {
      throw new NotFoundException("Submission has invalid state");
    }
    assertValidTransition(row.status, "cancelled");
    await this.db
      .update(schema.registrations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(schema.registrations.id, id));
    return { id, status: "cancelled" as const };
  }

  // ---------- internals ----------

  private async loadAndAuthorize(id: string, email: string) {
    if (!email) throw new NotFoundException("email required");
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Submission not found");
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    if ((meta.email as string)?.toLowerCase() !== email.trim().toLowerCase()) {
      throw new NotFoundException("Submission not found");
    }
    return row;
  }
}

// ---------- helpers ----------

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "Pending";
}
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return "Registrant";
  return parts.slice(1).join(" ");
}

function computeIsMinor(dobDate: string): boolean {
  const dob = new Date(dobDate + "T00:00:00Z");
  if (isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age < 18;
}

function mergeMetadata(
  prev: unknown,
  next: Record<string, unknown>
): Record<string, unknown> {
  const base = (prev as Record<string, unknown>) ?? {};
  return { ...base, ...next };
}
