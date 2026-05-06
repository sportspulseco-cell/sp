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
    private readonly email: EmailDispatcherService
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

    // Mock token — UUID-shaped, scoped to this submission. Real flow
    // would persist to a `parent_consent_tokens` table with TTL; for
    // mock-flow we encode the submission id as the token so the
    // confirm endpoint can resolve it without a new table.
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
    const subject = "Action required: please confirm your child's registration";
    const messageBody = [
      `A child registration on SportsPulse needs your consent before it can proceed.`,
      ``,
      `Confirm consent — paste this token back into the registration funnel:`,
      token,
      ``,
      `If you're not expecting this email, you can ignore it.`
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
