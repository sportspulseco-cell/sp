import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  REGISTRATION_DOCUMENT_KEYS,
  validateGoverningBodyId,
  type RegistrationDocumentKey
} from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import {
  RegistrationRequirementsService,
  requestClientIp,
  requestUserAgent,
  type RegistrationDocumentStatus
} from "../../registration-v2/application/registration-requirements.service";
import { ComplianceDocumentSubmissionsService } from "../application/document-submissions/document-submissions.service";
import { UploadComplianceDocumentBodyDto } from "./dto/compliance-document-upload.dto";

class SignMyDocumentBodyDto {
  @IsUUID()
  registrationId!: string;

  @IsIn([...REGISTRATION_DOCUMENT_KEYS])
  key!: RegistrationDocumentKey;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  signatureName!: string;
}

/** Registrations that no longer need documents: nothing to sign there. */
const CLOSED_REGISTRATION_STATES = ["cancelled", "rejected", "withdrawn"];

export interface MyRegistrationDocumentsDto {
  registrationId: string;
  seasonId: string;
  seasonName: string;
  orgName: string | null;
  status: string;
  subjectName: string;
  /** "self": the caller is the registrant. "minor": the caller is their linked guardian. */
  signingFor: "self" | "minor";
  /** The name the caller types to sign; null when no name is on file. */
  signerName: string | null;
  documents: RegistrationDocumentStatus[];
}

class SubmitIdentityVerificationBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  governingBodyCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  externalId!: string;
}

interface IdentityVerificationDto {
  id: string;
  personId: string;
  governingBodyId: string;
  externalId: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Self-service compliance endpoints. Unlike the admin-only controllers
 * in this module, these run with JwtAuthGuard alone and resolve the
 * caller's personId from their session — players use this to attest
 * their own governing-body IDs (e.g. USA Hockey) without admin help.
 *
 * Format validation lives in @sportspulse/kernel so the funnel +
 * compliance page share one source of truth.
 */
@ApiTags("compliance/self")
@ApiBearerAuth()
@Controller("compliance/self")
@UseGuards(JwtAuthGuard)
export class SelfComplianceController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly requirements: RegistrationRequirementsService,
    private readonly uploads: ComplianceDocumentSubmissionsService
  ) {}

  /**
   * People the caller may sign registration documents for: their own
   * person row(s), plus minors linked to them in family_links (not
   * unlinked). Nothing else; an admin signs through the admin route.
   */
  private async signablePeople(userId: string): Promise<{
    self: Array<{ id: string; name: string }>;
    minorIds: string[];
  }> {
    const own = await this.db
      .select({
        id: schema.persons.id,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName
      })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId));
    const links = await this.db
      .select({ minorPersonId: schema.familyLinks.minorPersonId })
      .from(schema.familyLinks)
      .where(
        and(
          eq(schema.familyLinks.guardianUserId, userId),
          isNull(schema.familyLinks.unlinkedAt)
        )
      );
    return {
      self: own.map((p) => ({ id: p.id, name: `${p.first} ${p.last}`.trim() })),
      minorIds: links.map((l) => l.minorPersonId)
    };
  }

  @Get("documents")
  @ApiOperation({
    summary:
      "Documents the caller must sign for their registrations (and their linked minors'), with signed/unsigned state. Same rule the registration funnel and the pay gate use (COMP-4, REG-5)."
  })
  async myDocuments(
    @CurrentUser() principal: AuthPrincipal
  ): Promise<{ items: MyRegistrationDocumentsDto[] }> {
    const people = await this.signablePeople(principal.userId);
    const subjectIds = [...people.self.map((p) => p.id), ...people.minorIds];
    if (subjectIds.length === 0) return { items: [] };
    const regs = await this.db
      .select({
        id: schema.registrations.id,
        seasonId: schema.registrations.seasonId,
        formVersionId: schema.registrations.formVersionId,
        subjectPersonId: schema.registrations.subjectPersonId,
        status: schema.registrations.status,
        seasonName: schema.seasons.name,
        orgName: schema.orgs.displayName,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName
      })
      .from(schema.registrations)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.registrations.seasonId))
      .innerJoin(schema.persons, eq(schema.persons.id, schema.registrations.subjectPersonId))
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.registrations.orgId))
      .where(
        and(
          inArray(schema.registrations.subjectPersonId, subjectIds),
          notInArray(schema.registrations.status, CLOSED_REGISTRATION_STATES)
        )
      )
      .orderBy(desc(schema.registrations.createdAt))
      .limit(25);

    const selfIds = new Set(people.self.map((p) => p.id));
    const guardianName = people.self[0]?.name || null;
    const items: MyRegistrationDocumentsDto[] = [];
    for (const r of regs) {
      const { documents } = await this.requirements.listDocuments(r);
      const isSelf = selfIds.has(r.subjectPersonId);
      const subjectName = `${r.first} ${r.last}`.trim();
      items.push({
        registrationId: r.id,
        seasonId: r.seasonId!,
        seasonName: r.seasonName,
        orgName: r.orgName ?? null,
        status: r.status,
        subjectName,
        signingFor: isSelf ? "self" : "minor",
        signerName: isSelf ? subjectName || null : guardianName,
        documents
      });
    }
    return { items };
  }

  @Post("documents/sign")
  @ApiOperation({
    summary:
      "Sign one required registration document (liability_waiver | code_of_conduct) for yourself, or for a minor linked to you as guardian. The typed name must match your legal name. Same writer as the funnel: one consent_signatures row per person and document text, with timestamp, IP and user agent."
  })
  async signMyDocument(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: SignMyDocumentBodyDto,
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> }
  ) {
    const [reg] = await this.db
      .select({
        id: schema.registrations.id,
        seasonId: schema.registrations.seasonId,
        formVersionId: schema.registrations.formVersionId,
        subjectPersonId: schema.registrations.subjectPersonId,
        status: schema.registrations.status
      })
      .from(schema.registrations)
      .where(eq(schema.registrations.id, body.registrationId))
      .limit(1);
    const people = await this.signablePeople(principal.userId);
    const self = people.self.find((p) => p.id === reg?.subjectPersonId) ?? null;
    const isGuardian = !!reg && people.minorIds.includes(reg.subjectPersonId);
    // Same 404 whether the registration is missing or someone else's.
    if (!reg || (!self && !isGuardian)) {
      throw new NotFoundException("Registration not found");
    }
    if (CLOSED_REGISTRATION_STATES.includes(reg.status)) {
      throw new ConflictException(
        `This registration is ${reg.status}, so there is nothing to sign.`
      );
    }
    const signerName = self ? self.name : people.self[0]?.name ?? "";
    if (!signerName) {
      throw new UnprocessableEntityException(
        "Your account has no legal name on file. Add it to your profile, then sign."
      );
    }
    const result = await this.requirements.signRequirement({
      registration: reg,
      key: body.key,
      signatureName: body.signatureName,
      expectedSignerName: signerName,
      signedByUserId: principal.userId,
      ipAddr: requestClientIp(req),
      userAgent: requestUserAgent(req)
    });
    return {
      signatureId: result.signatureId,
      documentVersionId: result.documentVersionId,
      signedAt: result.signedAt,
      alreadySigned: !result.created,
      documents: result.documents
    };
  }

  @Get("eligibility")
  @ApiOperation({
    summary:
      "The caller's own eligibility records (player /compliance). The admin list at /compliance/eligibility is super_admin only."
  })
  async myEligibility(@CurrentUser() principal: AuthPrincipal) {
    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);
    if (!person) return { items: [], nextCursor: null };
    const items = await this.db
      .select()
      .from(schema.eligibilityRecords)
      .where(eq(schema.eligibilityRecords.personId, person.id))
      .orderBy(desc(schema.eligibilityRecords.createdAt))
      .limit(50);
    return { items, nextCursor: null };
  }

  @Post("identity-verifications")
  @ApiOperation({
    summary:
      "Self-attest a governing-body external ID (e.g. USA Hockey). Format-validated; recorded as source=self_attest, status=pending."
  })
  async submitIdentityVerification(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: SubmitIdentityVerificationBodyDto
  ): Promise<IdentityVerificationDto> {
    const validation = validateGoverningBodyId(
      body.governingBodyCode,
      body.externalId
    );
    if (!validation.ok) {
      throw new BadRequestException(validation.reason);
    }

    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);
    if (!person) {
      throw new NotFoundException(
        "No person record linked to your user — finish onboarding first"
      );
    }

    const [governingBody] = await this.db
      .select({ id: schema.governingBodies.id })
      .from(schema.governingBodies)
      .where(eq(schema.governingBodies.code, body.governingBodyCode.toUpperCase()))
      .limit(1);
    if (!governingBody) {
      throw new NotFoundException(
        `Unknown governing body code "${body.governingBodyCode}"`
      );
    }

    // Upsert by (personId, governingBodyId) — the schema's unique index
    // is (personId, governingBodyId, externalId), but a player updating
    // their ID should overwrite the prior row, not stack a new one.
    const [existing] = await this.db
      .select({
        id: schema.identityVerifications.id,
        externalId: schema.identityVerifications.externalId
      })
      .from(schema.identityVerifications)
      .where(
        and(
          eq(schema.identityVerifications.personId, person.id),
          eq(schema.identityVerifications.governingBodyId, governingBody.id)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.identityVerifications)
        .set({
          externalId: validation.normalized,
          status: "pending",
          source: "self_attest",
          verifiedAt: null,
          updatedAt: sql`now()`
        })
        .where(eq(schema.identityVerifications.id, existing.id))
        .returning();
      return toDto(updated!);
    }

    const [inserted] = await this.db
      .insert(schema.identityVerifications)
      .values({
        personId: person.id,
        governingBodyId: governingBody.id,
        externalId: validation.normalized,
        status: "pending",
        source: "self_attest"
      })
      .returning();
    return toDto(inserted!);
  }

  // -------- Uploaded ID / eligibility documents (COMP-3) --------
  // Same people as signing: the caller, plus minors linked to them.

  @Get("documents/uploads")
  @ApiOperation({
    summary:
      "The caller's uploaded ID / eligibility documents (and their linked minors'), with status and the admin's latest decision, plus the seasons and registrations they can upload for (COMP-3)."
  })
  async myUploads(@CurrentUser() principal: AuthPrincipal) {
    const people = await this.signablePeople(principal.userId);
    const [items, targets] = await Promise.all([
      this.uploads.listMine(people),
      this.uploads.uploadTargets(people)
    ]);
    return { items, targets };
  }

  @Post("documents/uploads")
  @ApiOperation({
    summary:
      "Upload an ID or eligibility document (PDF/PNG/JPG/WebP, base64, 3 MB max, type checked by its bytes) for yourself or a linked minor. Stored privately; status pending until an admin decides. The same file for the same season again returns the existing row (alreadySubmitted: true)."
  })
  async uploadMine(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: UploadComplianceDocumentBodyDto
  ) {
    const people = await this.signablePeople(principal.userId);
    const result = await this.uploads.upload(principal.userId, people, body);
    // `id` and `orgId` at the top level for the audit interceptor.
    return {
      id: result.submission.id,
      orgId: result.submission.orgId,
      alreadySubmitted: result.alreadySubmitted,
      submission: result.submission
    };
  }

  @Get("documents/uploads/:id/file")
  @ApiOperation({
    summary:
      "A 5-minute signed URL for one of your own uploads (or your linked minor's). 404 for anything else. Written to the audit log."
  })
  myUploadFile(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string
  ) {
    return this.signablePeople(principal.userId).then((people) =>
      this.uploads.fileUrlForOwner(principal.userId, people, id)
    );
  }
}

function toDto(row: typeof schema.identityVerifications.$inferSelect): IdentityVerificationDto {
  return {
    id: row.id,
    personId: row.personId,
    governingBodyId: row.governingBodyId,
    externalId: row.externalId,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
