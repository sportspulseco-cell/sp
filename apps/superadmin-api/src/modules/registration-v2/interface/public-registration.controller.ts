import {
  Body,
  ConflictException,
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
import { ConfigService } from "@nestjs/config";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength
} from "class-validator";
import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  assertValidTransition,
  isRegistrationState,
  type RegistrationState
} from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { SupabaseAdminService } from "../../../shared/auth/supabase-admin.service";
import { EmailDispatcherService } from "../../../shared/notifications/email-dispatcher.service";
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

  /**
   * Division the player is registering into. The funnel collects
   * this in its "Pick a division" step (P2-2). Optional — funnels
   * for seasons with zero divisions skip the step entirely; the
   * field stays NULL and downstream surfaces fall back to org-wide.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  divisionId?: string;

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
    private readonly supabase: SupabaseAdminService,
    private readonly email: EmailDispatcherService,
    private readonly config: ConfigService
  ) {}

  @Get("open")
  @ApiOperation({
    summary:
      "List every season whose registration window is currently open AND has a published season_registration form. Powers the player-web 'Open registrations' discovery list — a player needs to find the season id before they can hit /register/:id. Anonymous; no auth required."
  })
  async listOpenRegistrations(): Promise<{
    items: Array<{
      seasonId: string;
      seasonName: string;
      sportCode: string;
      leagueId: string;
      leagueName: string;
      orgId: string;
      orgName: string;
      formId: string;
      formName: string;
      registrationOpensAt: string | null;
      registrationClosesAt: string | null;
    }>;
  }> {
    const now = new Date();
    const rows = await this.db
      .select({
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        sportCode: schema.seasons.sportCode,
        registrationOpensAt: schema.seasons.registrationOpensAt,
        registrationClosesAt: schema.seasons.registrationClosesAt,
        leagueId: schema.leagues.id,
        leagueName: schema.leagues.name,
        orgId: schema.orgs.id,
        orgName: schema.orgs.displayName,
        formId: schema.registrationForms.id,
        formName: schema.registrationForms.name
      })
      .from(schema.seasons)
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.leagues.orgId))
      .innerJoin(
        schema.registrationForms,
        and(
          eq(
            schema.registrationForms.purpose,
            "season_registration"
          ),
          sql`(${schema.registrationForms.seasonId} = ${schema.seasons.id} OR ${schema.registrationForms.scope} = 'league')`,
          isNotNull(schema.registrationForms.activeVersionId),
          isNull(schema.registrationForms.deletedAt)
        )
      )
      .where(
        and(
          lte(schema.seasons.registrationOpensAt, now),
          gte(schema.seasons.registrationClosesAt, now),
          sql`${schema.seasons.status} IN ('draft','registration_open')`
        )
      )
      .orderBy(schema.seasons.registrationClosesAt);

    // Deduplicate by seasonId — if both a season-bound form and a
    // league-scope form match, the season-bound one wins (it appears
    // first in the join).
    const seen = new Set<string>();
    const items: Array<{
      seasonId: string;
      seasonName: string;
      sportCode: string;
      leagueId: string;
      leagueName: string;
      orgId: string;
      orgName: string;
      formId: string;
      formName: string;
      registrationOpensAt: string | null;
      registrationClosesAt: string | null;
    }> = [];
    for (const r of rows) {
      if (seen.has(r.seasonId)) continue;
      seen.add(r.seasonId);
      items.push({
        seasonId: r.seasonId,
        seasonName: r.seasonName,
        sportCode: r.sportCode,
        leagueId: r.leagueId,
        leagueName: r.leagueName,
        orgId: r.orgId,
        orgName: r.orgName,
        formId: r.formId,
        formName: r.formName,
        registrationOpensAt: r.registrationOpensAt?.toISOString() ?? null,
        registrationClosesAt: r.registrationClosesAt?.toISOString() ?? null
      });
    }
    return { items };
  }

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

    // Divisions list for the in-funnel "Pick a division" step
    // (P2-2 / audit §8.1). The funnel skips the step when there's
    // 0 or 1 divisions; with 1 it auto-picks; with 0 the field
    // stays NULL and the player applies via org-wide listing.
    const divisionsList = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        tier: schema.divisions.tier
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.seasonId, id))
      .orderBy(schema.divisions.tier);

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
          // Match a form bound to this season (preferred), or any
          // legacy league-scoped season_registration form. Both
          // patterns coexist — the /forms wizard now writes scope=
          // 'season' + seasonId, while older rows are scope='league'.
          // We OR them together rather than requiring league-only,
          // so seeded data + new wizard output both render.
          sql`(${schema.registrationForms.seasonId} = ${id} OR ${schema.registrationForms.scope} = 'league')`,
          // Post-slice-4: form-builder unification. Forms are tagged
          // with a `purpose` and the funnel pulls the
          // season_registration one. Older rows without a purpose
          // default to season_registration in the column default.
          eq(schema.registrationForms.purpose, "season_registration")
        )
      )
      .orderBy(desc(schema.registrationFormVersions.publishedAt))
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
        status: season.status,
        // Per-season toggles from the wizard's Divisions & eligibility
        // step. Funnel reads these to skip the free-agent path when
        // disabled, skip parental consent when not required, etc.
        // Schema: @sportspulse/kernel SeasonConfig.
        config: (season.config ?? {}) as Record<string, unknown>
      },
      pricingTiers: tiers.filter((t) => t.isActive),
      divisions: divisionsList,
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

    // Find-or-create the persons row.
    //
    // Lookup priority:
    //   1. By auth user_id — strongest link, set on every previous
    //      registration this user has done.
    //   2. By legal name — a fallback for the very first registration.
    //
    // Whichever path we take, ensure the row ends up with userId set,
    // otherwise iam.meScope returns null personId and the player
    // dashboard renders "Finish onboarding first".
    let personId: string | undefined;
    const [byUser] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (byUser) {
      personId = byUser.id;
    } else {
      const existingPersonRow = await this.db
        .select({ id: schema.persons.id, userId: schema.persons.userId })
        .from(schema.persons)
        .where(
          and(
            eq(schema.persons.legalFirstName, firstName(body.fullName)),
            eq(schema.persons.legalLastName, lastName(body.fullName))
          )
        )
        .limit(1);
      if (existingPersonRow[0]) {
        personId = existingPersonRow[0].id;
        // Adopt this name-matched row only when it isn't already
        // claimed by a different auth user — otherwise we'd silently
        // hijack someone else's profile.
        if (!existingPersonRow[0].userId) {
          await this.db
            .update(schema.persons)
            .set({ userId, updatedAt: new Date() })
            .where(eq(schema.persons.id, personId));
        }
      } else {
        const [person] = await this.db
          .insert(schema.persons)
          .values({
            userId,
            legalFirstName: firstName(body.fullName),
            legalLastName: lastName(body.fullName),
            dobDate: body.dobDate ?? null,
            externalIds: { email, supabaseUserId: userId }
          })
          .returning({ id: schema.persons.id });
        personId = person!.id;
      }
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

    let reg: typeof schema.registrations.$inferSelect | undefined;
    try {
      [reg] = await this.db
        .insert(schema.registrations)
        .values({
          idempotencyKey,
          orgId: season.orgId,
          formVersionId: anyVersion.id,
          submittedByUserId: userId,
          subjectPersonId: personId!,
          seasonId,
          divisionId: body.divisionId ?? null,
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
    } catch (e) {
      const conflict = await this.handleActiveDuplicate(
        e,
        personId!,
        seasonId
      );
      if (conflict) throw conflict;
      throw e;
    }

    return {
      id: reg!.id,
      status: reg!.status,
      resumed: false,
      userId,
      userCreated,
      isMinor
    };
  }

  @Post("seasons/:id/resume")
  @ApiOperation({
    summary:
      "Phase 1 alt-path — resume an existing account. Looks up the Supabase user by email, find-or-creates the persons + registrations rows, and returns the same shape as POST /seasons/:id/submissions. Used by the funnel's 'Already have an account?' Sign-in card so returning visitors don't have to re-enter first/last name."
  })
  async resumeSubmission(
    @Param("id") seasonId: string,
    @Body()
    body: {
      email: string;
      submissionType?:
        | "team"
        | "individual"
        | "free_agent"
        | "captain_invite";
    }
  ) {
    const [season] = await this.db
      .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) throw new NotFoundException("email required");

    const detail = await this.supabase.findUserDetailByEmail(email);
    if (!detail) {
      throw new NotFoundException(
        "No account found for that email. Use the form above to create one."
      );
    }
    const userId = detail.userId;
    const fullName = detail.displayName?.trim() || email.split("@")[0]!;

    const submissionType = body.submissionType ?? "individual";
    const idempotencyKey = `${email}|${seasonId}|${submissionType}`;

    // Find-or-create person row — same priority as startSubmission:
    // by userId first, then by name (and back-fill userId if missing).
    let personId: string | undefined;
    const [byUser] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (byUser) {
      personId = byUser.id;
    } else {
      const existingPersonRow = await this.db
        .select({ id: schema.persons.id, userId: schema.persons.userId })
        .from(schema.persons)
        .where(
          and(
            eq(schema.persons.legalFirstName, firstName(fullName)),
            eq(schema.persons.legalLastName, lastName(fullName))
          )
        )
        .limit(1);
      if (existingPersonRow[0]) {
        personId = existingPersonRow[0].id;
        if (!existingPersonRow[0].userId) {
          await this.db
            .update(schema.persons)
            .set({ userId, updatedAt: new Date() })
            .where(eq(schema.persons.id, personId));
        }
      } else {
        const [person] = await this.db
          .insert(schema.persons)
          .values({
            userId,
            legalFirstName: firstName(fullName),
            legalLastName: lastName(fullName),
            externalIds: { email, supabaseUserId: userId }
          })
          .returning({ id: schema.persons.id });
        personId = person!.id;
      }
    }

    const [anyVersion] = await this.db
      .select()
      .from(schema.registrationFormVersions)
      .limit(1);
    if (!anyVersion) {
      throw new NotFoundException(
        "No registration form is configured. Admin must create a form before opening registration."
      );
    }

    const [existing] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return {
        id: existing.id,
        status: existing.status,
        resumed: true,
        userId,
        userCreated: false,
        isMinor: false,
        fullName
      };
    }

    let reg: typeof schema.registrations.$inferSelect | undefined;
    try {
      [reg] = await this.db
        .insert(schema.registrations)
        .values({
          idempotencyKey,
          orgId: season.orgId,
          formVersionId: anyVersion.id,
          submittedByUserId: userId,
          subjectPersonId: personId!,
          seasonId,
          status: "pending_payment" as RegistrationState,
          metadata: {
            submissionType,
            pricingTierId: null,
            email,
            fullName,
            phone: null,
            dobDate: null,
            answers: {},
            isMinor: false
          }
        })
        .returning();
    } catch (e) {
      const conflict = await this.handleActiveDuplicate(
        e,
        personId!,
        seasonId
      );
      if (conflict) throw conflict;
      throw e;
    }

    return {
      id: reg!.id,
      status: reg!.status,
      resumed: false,
      userId,
      userCreated: false,
      isMinor: false,
      fullName
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

  @Get("seasons/:id/waivers")
  @ApiOperation({
    summary:
      "Phase 3.1 — return the org's active waivers/consents that the registrant must sign. Returns only the active document_version per document, in a fixed order (waiver → code_of_conduct → media_release → privacy → custom)."
  })
  async listWaivers(@Param("id") seasonId: string) {
    const [season] = await this.db
      .select({ orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    const rows = await this.db
      .select({
        documentId: schema.documents.id,
        kind: schema.documents.kind,
        name: schema.documents.name,
        description: schema.documents.description,
        versionId: schema.documentVersions.id,
        contentHtml: schema.documentVersions.contentHtml,
        languageCode: schema.documentVersions.languageCode
      })
      .from(schema.documents)
      .innerJoin(
        schema.documentVersions,
        eq(schema.documentVersions.id, schema.documents.activeVersionId)
      )
      .where(eq(schema.documents.orgId, season.orgId));

    const order: Record<string, number> = {
      waiver: 0,
      code_of_conduct: 1,
      media_release: 2,
      privacy: 3,
      injury_policy: 4,
      consent: 5,
      parental: 6,
      custom: 7
    };
    const sorted = rows.sort(
      (a, b) => (order[a.kind] ?? 99) - (order[b.kind] ?? 99)
    );
    return {
      // The funnel hard-blocks until every "required" kind is signed.
      // Spec §6.1: waiver + code_of_conduct required; media_release optional.
      requiredKinds: ["waiver", "code_of_conduct"],
      documents: sorted
    };
  }

  @Post("submissions/:id/sign-waiver")
  @ApiOperation({
    summary:
      "Phase 3.1 — record a signed waiver. Stores typed signature name + IP + user agent on consent_signatures (immutable). Returns how many of the required waivers are still unsigned."
  })
  async signWaiver(
    @Param("id") submissionId: string,
    @Body()
    body: {
      email: string;
      documentVersionId: string;
      signatureName: string;
    }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    if (!body.signatureName?.trim() || !body.documentVersionId) {
      throw new NotFoundException(
        "documentVersionId + signatureName required"
      );
    }

    // Idempotent: if this person has already signed this version,
    // return the existing signature.
    const [existing] = await this.db
      .select()
      .from(schema.consentSignatures)
      .where(
        and(
          eq(schema.consentSignatures.personId, row.subjectPersonId),
          eq(
            schema.consentSignatures.documentVersionId,
            body.documentVersionId
          )
        )
      )
      .limit(1);

    let signature = existing;
    if (!signature) {
      const [created] = await this.db
        .insert(schema.consentSignatures)
        .values({
          personId: row.subjectPersonId,
          documentVersionId: body.documentVersionId,
          signedByUserId: row.submittedByUserId,
          // Store the typed name in metadata-ish fashion via geolocation
          // is gross — there's no signature_text column. Use the
          // existing signatureBlobUrl text col to hold the name; spec
          // §6.1 specifies typed name = data-URL of signed text. Wave E
          // adds a proper signature_text column.
          signatureBlobUrl: `data:text/plain,${encodeURIComponent(body.signatureName.trim())}`
        })
        .returning();
      signature = created;
    }

    // Compute remaining required signatures so the funnel knows whether
    // to advance to the next step.
    const [season] = await this.db
      .select({ orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .innerJoin(
        schema.registrations,
        eq(schema.registrations.orgId, schema.seasons.orgId)
      )
      .where(eq(schema.registrations.id, submissionId))
      .limit(1);

    let outstandingRequired = 0;
    if (season) {
      const requiredDocs = await this.db
        .select({ versionId: schema.documents.activeVersionId })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.orgId, season.orgId),
            // Required = waiver + code_of_conduct per spec §6.1
            // Drizzle doesn't have a clean inArray import here so we
            // do two checks in one OR — simpler to rely on a fold.
          )
        );
      const requiredKinds = new Set(["waiver", "code_of_conduct"]);
      const requiredVersionIds = (
        await this.db
          .select({
            versionId: schema.documents.activeVersionId,
            kind: schema.documents.kind
          })
          .from(schema.documents)
          .where(eq(schema.documents.orgId, season.orgId))
      )
        .filter((d) => requiredKinds.has(d.kind) && d.versionId)
        .map((d) => d.versionId as string);

      if (requiredVersionIds.length > 0) {
        const signed = await this.db
          .select({ versionId: schema.consentSignatures.documentVersionId })
          .from(schema.consentSignatures)
          .where(eq(schema.consentSignatures.personId, row.subjectPersonId));
        const signedSet = new Set(signed.map((s) => s.versionId));
        outstandingRequired = requiredVersionIds.filter(
          (v) => !signedSet.has(v)
        ).length;
      }
    }

    return {
      signatureId: signature!.id,
      outstandingRequired
    };
  }

  @Post("submissions/:id/parental-consent/start")
  @ApiOperation({
    summary:
      "Phase 3.2 — kick off the parental consent flow for a minor. Stores parent email on the submission metadata and returns a mock consent token (real email delivery wires up with Resend in a follow-up slice)."
  })
  async startParentalConsent(
    @Param("id") submissionId: string,
    @Body() body: { email: string; parentEmail: string }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    if (row.status !== "pending_consent") {
      throw new Error(
        `Cannot start parental consent from status=${row.status}; only valid from pending_consent.`
      );
    }
    if (!body.parentEmail?.includes("@")) {
      throw new Error("parentEmail required");
    }

    // Token is base64url(`${submissionId}:${issuedAtMs}`). The redeem
    // endpoint (POST /parental-consent/redeem) validates the embedded
    // submissionId matches the row and rejects tokens older than 24h
    // via the timestamp.
    const token = Buffer.from(`${submissionId}:${Date.now()}`).toString(
      "base64url"
    );
    const meta = mergeMetadata(row.metadata, {
      parentEmail: body.parentEmail.trim().toLowerCase(),
      parentConsentTokenIssuedAt: new Date().toISOString()
    });
    await this.db
      .update(schema.registrations)
      .set({ metadata: meta, updatedAt: new Date() })
      .where(eq(schema.registrations.id, submissionId));

    const playerWebBase =
      this.config.get<string>("PLAYER_WEB_URL") ??
      "https://sp-player-red.vercel.app";
    const portalUrl = `${playerWebBase}/parental-consent/${token}`;
    const subject = "Action required: please confirm your child's registration";
    const messageBody = [
      `A child registration on SportsPulse needs your consent before it can proceed.`,
      ``,
      `Click here to review and confirm:`,
      portalUrl,
      ``,
      `This link expires in 24 hours. If you weren't expecting this email, ignore it.`
    ].join("\n");

    // Real Resend dispatch (or log-only fallback if RESEND_API_KEY
    // unset). The mockConsentMessage comes back regardless so the
    // funnel can offer a copy/paste fallback.
    const dispatch = await this.email.send({
      to: body.parentEmail,
      subject,
      body: messageBody,
      channel: "registration.parental_consent"
    });

    return {
      consentToken: token,
      emailDelivered: dispatch.delivered,
      emailDeliveryReason: dispatch.reason ?? null,
      mockConsentMessage: {
        to: body.parentEmail,
        subject,
        body: messageBody
      }
    };
  }

  @Post("submissions/:id/parental-consent/confirm")
  @ApiOperation({
    summary:
      "Phase 3.2 — confirm parental consent. Advances state pending_consent → pending_payment."
  })
  async confirmParentalConsent(
    @Param("id") submissionId: string,
    @Body() body: { email: string; consentToken: string }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    if (!isRegistrationState(row.status)) {
      throw new Error("Invalid current state");
    }
    assertValidTransition(row.status, "pending_payment");
    // Decode the token; verify it belongs to this submission.
    let decoded = "";
    try {
      decoded = Buffer.from(body.consentToken, "base64url").toString("utf-8");
    } catch {
      throw new Error("Invalid consent token");
    }
    if (!decoded.startsWith(`${submissionId}:`)) {
      throw new Error("Consent token does not match submission");
    }
    const meta = mergeMetadata(row.metadata, {
      parentConsentConfirmedAt: new Date().toISOString()
    });
    await this.db
      .update(schema.registrations)
      .set({ status: "pending_payment", metadata: meta, updatedAt: new Date() })
      .where(eq(schema.registrations.id, submissionId));
    return { id: submissionId, status: "pending_payment" as const };
  }

  /**
   * Parent-portal pre-fetch: a parent clicks the URL we emailed them
   * (https://sp-player-red.vercel.app/parental-consent/:token) and
   * the page calls this to look up context — child name, season name,
   * organisation name — so the parent has enough information to
   * decide whether to consent.
   *
   * Anonymous: the token IS the auth. No Supabase session required.
   * Backlog #8 / Parent portal.
   */
  @Get("parental-consent/:token")
  @ApiOperation({
    summary:
      "Anonymous lookup: decode a parental-consent token and return display context (child name, season, org). Used by the parent portal."
  })
  async getParentalConsentContext(@Param("token") token: string): Promise<{
    submissionId: string;
    status: string;
    childDisplayName: string;
    seasonName: string | null;
    orgName: string | null;
    expired: boolean;
    confirmedAt: string | null;
  }> {
    const decoded = this.decodeConsentToken(token);
    if (!decoded) {
      throw new NotFoundException("Invalid or expired consent token");
    }
    const [row] = await this.db
      .select({
        r: schema.registrations,
        orgName: schema.orgs.displayName,
        seasonName: schema.seasons.name
      })
      .from(schema.registrations)
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.registrations.orgId))
      .leftJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.registrations.seasonId)
      )
      .where(eq(schema.registrations.id, decoded.submissionId))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    const meta = (row.r.metadata as Record<string, unknown>) ?? {};
    return {
      submissionId: row.r.id,
      status: row.r.status,
      childDisplayName: (meta.fullName as string) ?? "your child",
      seasonName: row.seasonName ?? null,
      orgName: row.orgName ?? null,
      expired: decoded.expired,
      confirmedAt: (meta.parentConsentConfirmedAt as string) ?? null
    };
  }

  /**
   * Parent-portal action: confirm or decline the registration. No
   * Supabase auth — token-only. On confirm, advances state
   * pending_consent → pending_payment. On decline, status → cancelled.
   * Backlog #8 / Parent portal.
   */
  @Post("parental-consent/:token/redeem")
  @ApiOperation({
    summary:
      "Anonymous redeem: parent confirms or declines via the portal. 410 when the token is expired (>24h)."
  })
  async redeemParentalConsent(
    @Param("token") token: string,
    @Body() body: { action: "confirm" | "decline" }
  ): Promise<{ submissionId: string; status: string }> {
    const decoded = this.decodeConsentToken(token);
    if (!decoded) {
      throw new NotFoundException("Invalid consent token");
    }
    if (decoded.expired) {
      throw new ConflictException({
        error: "consent_token_expired",
        message:
          "This consent link has expired. Ask the player to resend the consent email."
      });
    }
    if (body.action !== "confirm" && body.action !== "decline") {
      throw new ConflictException({
        error: "invalid_action",
        message: "action must be 'confirm' or 'decline'"
      });
    }

    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, decoded.submissionId))
      .limit(1);
    if (!row) throw new NotFoundException("Submission not found");
    if (row.status !== "pending_consent") {
      throw new ConflictException({
        error: "not_pending_consent",
        message: `Registration is in status=${row.status}; only pending_consent can be redeemed.`,
        currentStatus: row.status
      });
    }

    const now = new Date();
    if (body.action === "confirm") {
      const meta = mergeMetadata(row.metadata, {
        parentConsentConfirmedAt: now.toISOString()
      });
      await this.db
        .update(schema.registrations)
        .set({
          status: "pending_payment",
          metadata: meta,
          updatedAt: now
        })
        .where(eq(schema.registrations.id, decoded.submissionId));
      return { submissionId: decoded.submissionId, status: "pending_payment" };
    }

    // Decline.
    const meta = mergeMetadata(row.metadata, {
      parentConsentDeclinedAt: now.toISOString()
    });
    await this.db
      .update(schema.registrations)
      .set({
        status: "cancelled",
        metadata: meta,
        updatedAt: now
      })
      .where(eq(schema.registrations.id, decoded.submissionId));
    return { submissionId: decoded.submissionId, status: "cancelled" };
  }

  /**
   * Decode a base64url(`${submissionId}:${issuedAtMs}`) consent token.
   * Returns null on parse failure; marks `expired` when the timestamp
   * is older than 24h so callers can render a "this link expired"
   * state instead of a generic "invalid token" message.
   */
  private decodeConsentToken(
    token: string
  ): { submissionId: string; issuedAt: Date; expired: boolean } | null {
    let decoded = "";
    try {
      decoded = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return null;
    }
    const sep = decoded.indexOf(":");
    if (sep <= 0) return null;
    const submissionId = decoded.slice(0, sep);
    const issuedAtMs = Number(decoded.slice(sep + 1));
    if (
      !submissionId ||
      Number.isNaN(issuedAtMs) ||
      submissionId.length < 32
    ) {
      return null;
    }
    const issuedAt = new Date(issuedAtMs);
    const ageMs = Date.now() - issuedAtMs;
    return {
      submissionId,
      issuedAt,
      expired: ageMs > 24 * 60 * 60 * 1000
    };
  }

  @Post("submissions/:id/eligibility-check")
  @ApiOperation({
    summary:
      "Phase 3.3 — run automated eligibility checks (age fit, duplicate detection, USA Hockey ID format). Returns flags. Does NOT block the funnel; flags surface in the admin review queue (spec §6.3 — payment proceeds in parallel)."
  })
  async eligibilityCheck(
    @Param("id") submissionId: string,
    @Body() body: { email: string }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const flags: string[] = [];

    // Age vs season — coarse check until divisions get min/max age
    // columns. We just flag if age < 5 or > 80 as obvious typos.
    const dob = meta.dobDate as string | null;
    if (dob) {
      const age = ageFromDob(dob);
      if (age !== null && (age < 5 || age > 80)) {
        flags.push(`age_out_of_range:${age}`);
      }
    } else {
      flags.push("dob_missing");
    }

    // Duplicate detection — same email + season already has another
    // registration that's not this one. Idempotency key prevents the
    // exact-same path from creating two; a different path is still
    // worth flagging to admin.
    const dupes = await this.db
      .select({ id: schema.registrations.id })
      .from(schema.registrations)
      .where(eq(schema.registrations.subjectPersonId, row.subjectPersonId));
    if (dupes.length > 1) flags.push("duplicate_subject");

    // USA Hockey ID format — if present in answers, validate format.
    const answers = (meta.answers as Record<string, unknown>) ?? {};
    const usaHockeyId = answers["usa_hockey_id"];
    if (typeof usaHockeyId === "string" && usaHockeyId.trim()) {
      if (!/^[A-Z0-9]{6,12}$/i.test(usaHockeyId.trim())) {
        flags.push("usa_hockey_id_format_invalid");
      }
    }

    // Persist flags on the submission so admin review can see them.
    const merged = mergeMetadata(meta, {
      eligibilityChecks: {
        ranAt: new Date().toISOString(),
        flags
      }
    });
    await this.db
      .update(schema.registrations)
      .set({ metadata: merged, updatedAt: new Date() })
      .where(eq(schema.registrations.id, submissionId));

    return { passed: flags.length === 0, flags };
  }

  @Post("submissions/:id/pay")
  @ApiOperation({
    summary:
      "Phase 4 (mock) — simulate Stripe charge. Creates an invoice + invoice_items row, marks invoice paid, transitions submission pending_payment → pending_review. Real Stripe integration replaces the mock branch when STRIPE_SECRET_KEY is configured."
  })
  async pay(
    @Param("id") submissionId: string,
    @Body()
    body: {
      email: string;
      mockOutcome?: "succeeded" | "failed" | "offline";
    }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    if (!isRegistrationState(row.status)) {
      throw new Error("Invalid submission state");
    }
    if (row.status !== "pending_payment") {
      throw new Error(
        `Cannot pay from state=${row.status}; expected pending_payment.`
      );
    }
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const outcome = body.mockOutcome ?? "succeeded";

    // Resolve pricing tier amount. If none picked, default to 0 — the
    // funnel may have skipped the Tier step when the season has no
    // active tiers.
    let amountCents = 0;
    let currency = "USD";
    let tierName = "Registration fee";
    const tierId = meta.pricingTierId as string | null | undefined;
    if (tierId) {
      const [tier] = await this.db
        .select()
        .from(schema.pricingTiers)
        .where(eq(schema.pricingTiers.id, tierId))
        .limit(1);
      if (tier) {
        amountCents = tier.fullPriceCents;
        currency = tier.currency;
        tierName = tier.name;
      }
    }

    // Offline branch — no charge, admin marks paid later. Move to
    // pending_offline; admin will toggle to pending_review.
    if (outcome === "offline") {
      assertValidTransition(row.status, "pending_offline");
      await this.db
        .update(schema.registrations)
        .set({
          status: "pending_offline",
          metadata: mergeMetadata(meta, {
            payment: { outcome: "offline", amountCents, currency }
          }),
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, submissionId));
      return {
        id: submissionId,
        status: "pending_offline" as const,
        invoiceId: null,
        mock: true
      };
    }

    if (outcome === "failed") {
      // Spec §7.2: stay in pending_payment, surface decline message.
      await this.db
        .update(schema.registrations)
        .set({
          metadata: mergeMetadata(meta, {
            payment: {
              outcome: "failed",
              attemptedAt: new Date().toISOString(),
              reason: "Mock decline — card_declined"
            }
          }),
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, submissionId));
      return {
        id: submissionId,
        status: "pending_payment" as const,
        invoiceId: null,
        mock: true,
        declineReason: "Your card was declined (mock)."
      };
    }

    // Happy path: succeeded. Create invoice + line item, mark paid,
    // transition to pending_review.
    const invoiceNumber = `INV-${Date.now().toString().slice(-9)}`;
    const idempotencyKey = `submission:${submissionId}`;

    // Idempotency — if invoice already exists for this submission,
    // reuse it.
    const existing = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.idempotencyKey, idempotencyKey))
      .limit(1);

    let invoiceId: string;
    if (existing[0]) {
      invoiceId = existing[0].id;
    } else {
      const [inv] = await this.db
        .insert(schema.invoices)
        .values({
          orgId: row.orgId,
          invoiceNumber,
          registrationId: submissionId,
          recipientEmail: meta.email as string,
          currency,
          subtotalCents: amountCents,
          totalCents: amountCents,
          paidCents: amountCents,
          status: "paid",
          issuedAt: new Date(),
          paidAt: new Date(),
          idempotencyKey,
          metadata: { mockStripe: true, tierId }
        })
        .returning();
      invoiceId = inv!.id;
      await this.db.insert(schema.invoiceItems).values({
        invoiceId,
        kind: "registration_fee",
        description: tierName,
        quantity: 1,
        unitAmountCents: amountCents,
        amountCents
      });
    }

    assertValidTransition(row.status, "pending_review");
    await this.db
      .update(schema.registrations)
      .set({
        status: "pending_review",
        submittedAt: new Date(),
        metadata: mergeMetadata(meta, {
          payment: {
            outcome: "succeeded",
            paidAt: new Date().toISOString(),
            amountCents,
            currency,
            invoiceId,
            mockStripe: true
          }
        }),
        updatedAt: new Date()
      })
      .where(eq(schema.registrations.id, submissionId));

    return {
      id: submissionId,
      status: "pending_review" as const,
      invoiceId,
      amountCents,
      currency,
      mock: true
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

  /**
   * Turn a Postgres unique-violation on `registrations_active_uniq`
   * into a `409 Conflict` with the id of the existing active row.
   * Returns null for any other error so the caller can re-throw it.
   * Plan P2-3 / audit §4.1 + §8.2.
   */
  private async handleActiveDuplicate(
    err: unknown,
    subjectPersonId: string,
    seasonId: string
  ): Promise<ConflictException | null> {
    // Drizzle wraps the underlying pg error; the code might be on
    // the original or the wrapper. Check both.
    const e = err as { code?: string; cause?: { code?: string } };
    const code = e.code ?? e.cause?.code;
    if (code !== "23505") return null;
    const [existing] = await this.db
      .select({
        id: schema.registrations.id,
        status: schema.registrations.status
      })
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.subjectPersonId, subjectPersonId),
          eq(schema.registrations.seasonId, seasonId),
          sql`${schema.registrations.status} NOT IN ('rejected','withdrawn','cancelled')`
        )
      )
      .limit(1);
    if (!existing) return null;
    return new ConflictException({
      error: "active_registration_exists",
      message:
        "You already have an active registration for this season. Resume it instead of starting over.",
      registrationId: existing.id,
      status: existing.status
    });
  }

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

function ageFromDob(dob: string): number | null {
  const d = new Date(dob + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
