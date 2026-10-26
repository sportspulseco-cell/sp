import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  COMPLIANCE_DOCUMENT_KIND_LABELS,
  COMPLIANCE_DOCUMENT_STATUS_LABELS,
  COMPLIANCE_DOCUMENT_STATUSES,
  COMPLIANCE_FILE_URL_TTL_SECONDS,
  checkComplianceDecision,
  checkComplianceUpload,
  compareLicenceToPerson,
  complianceFileExtension,
  licenceLast4,
  parseAamva,
  type LicenceCheckField,
  type LicenceCheckMethod,
  type LicenceCheckResult,
  type ComplianceDocumentDecision,
  type ComplianceDocumentKind,
  type ComplianceDocumentStatus
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";
import type { UserScope } from "../../../../shared/auth/scope";
import { visibleComplianceSubmissionsWhere } from "../../../../shared/auth/visibility";
import { AuditWriterService } from "../../../audit/application/audit-writer.service";
import { NotificationService } from "../../../communications/application/notification.service";
import { complianceRecipients } from "../compliance-recipients";

/**
 * COMP-3 + COMP-1 (UC-29): player / guardian uploads of ID and
 * eligibility documents, the admin review queue, decisions, and signed
 * file links. One service so the player controller and the admin
 * controller share every rule.
 *
 * The chain: uploaded bytes (type checked by magic bytes, sha256) ->
 * private storage object -> submission row (one transaction, replay-safe
 * on the same file) -> admin decision (row lock, append-only decision
 * row + status, one transaction) -> readback -> notification to the
 * player (or guardian) and the team captain(s).
 *
 * Not done here on purpose: a decision does not change eligibility
 * records (no eligibility rule reads documents yet), and approving a
 * scanned signed waiver does not create a consent signature.
 */

/** Registrations that no longer take documents. Same list as self-compliance signing. */
const CLOSED_REGISTRATION_STATES = ["cancelled", "rejected", "withdrawn"];

const QUEUE_DEFAULT_LIMIT = 50;
const QUEUE_MAX_LIMIT = 100;

/** The caller's own person rows and the minors linked to them (SelfComplianceController.signablePeople). */
export interface UploadPeople {
  self: Array<{ id: string; name: string }>;
  minorIds: string[];
}

/** A season / registration the caller may upload a document for. */
export interface ComplianceUploadTargetDto {
  personId: string;
  personName: string;
  /** True when the person is a minor linked to the caller (guardian upload). */
  forMinor: boolean;
  orgId: string;
  orgName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  registrationId: string | null;
  teamName: string | null;
}

export interface ComplianceDocumentDecisionDto {
  decision: ComplianceDocumentDecision;
  reason: string | null;
  decidedAt: string;
  decidedByName: string | null;
}

export interface ComplianceDocumentSubmissionDto {
  id: string;
  personId: string;
  personName: string;
  orgId: string;
  orgName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  registrationId: string | null;
  documentVersionId: string | null;
  kind: ComplianceDocumentKind;
  contentType: string;
  sizeBytes: number;
  status: ComplianceDocumentStatus;
  submittedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null while nobody has decided. */
  latestDecision: ComplianceDocumentDecisionDto | null;
}

/** Queue row: the submission plus what the reviewer checks it against (UC-29). */
export interface AdminComplianceDocumentDto extends ComplianceDocumentSubmissionDto {
  dobDate: string | null;
  submittedByName: string | null;
  /** True when someone other than the person uploaded it (a guardian). */
  submittedByOther: boolean;
  divisionName: string | null;
  divisionGender: string | null;
  ageGroupLabel: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
  sha256: string;
  decisions: ComplianceDocumentDecisionDto[];
  /** Licence barcode checks on this document, oldest first (UC-29). */
  idChecks: LicenceIdCheckDto[];
}

/** One stored licence check: no full number, no card name or DOB. */
export interface LicenceIdCheckDto {
  id: string;
  submissionId: string;
  method: LicenceCheckMethod;
  result: LicenceCheckResult;
  mismatchedFields: LicenceCheckField[];
  documentType: "DL" | "ID";
  jurisdiction: string | null;
  licenceLast4: string;
  expiresOn: string | null;
  checkedAt: string;
  checkedByName: string | null;
}


export interface UploadComplianceDocumentInput {
  personId: string;
  orgId: string;
  seasonId?: string | null;
  registrationId?: string | null;
  kind: ComplianceDocumentKind;
  documentVersionId?: string | null;
  dataBase64: string;
}

type SubmissionRow = {
  id: string;
  personId: string;
  orgId: string;
  seasonId: string | null;
  registrationId: string | null;
  documentVersionId: string | null;
  kind: string;
  storageBucket: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  submittedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  first: string;
  last: string;
  preferred: string | null;
  personUserId: string | null;
  dobDate: string | null;
  orgName: string | null;
  seasonName: string | null;
};

type AdminRow = SubmissionRow & {
  submittedByName: string | null;
  submittedByEmail: string | null;
  divisionName: string | null;
  divisionGender: string | null;
  ageGroupLabel: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
};

function personName(r: { first: string; last: string; preferred?: string | null }): string {
  return `${r.preferred?.trim() || r.first} ${r.last}`.trim();
}

function groupBySubmission(rows: LicenceIdCheckDto[]): Map<string, LicenceIdCheckDto[]> {
  const out = new Map<string, LicenceIdCheckDto[]>();
  for (const r of rows) out.set(r.submissionId, [...(out.get(r.submissionId) ?? []), r]);
  return out;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new BadRequestException("Invalid cursor");
  }
  return { createdAt, id };
}

@Injectable()
export class ComplianceDocumentSubmissionsService {
  private readonly log = new Logger(ComplianceDocumentSubmissionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: SupabaseAdminService,
    private readonly notify: NotificationService,
    private readonly audit: AuditWriterService,
    private readonly config: ConfigService
  ) {}

  // ------------------------------------------------------------------
  // Player / guardian side
  // ------------------------------------------------------------------

  /**
   * Where the caller can send a document: their open registrations and
   * active team seasons, and those of minors linked to them. The org
   * (and season) decides which admins review it, so the server derives
   * it here and the upload must name one of these targets.
   */
  async uploadTargets(people: UploadPeople): Promise<ComplianceUploadTargetDto[]> {
    const selfIds = people.self.map((p) => p.id);
    const subjectIds = [...new Set([...selfIds, ...people.minorIds])];
    if (subjectIds.length === 0) return [];
    const p = schema.persons;
    const r = schema.registrations;
    const [regs, memberships] = await Promise.all([
      this.db
        .select({
          registrationId: r.id,
          personId: r.subjectPersonId,
          orgId: r.orgId,
          seasonId: r.seasonId,
          seasonName: schema.seasons.name,
          orgName: schema.orgs.displayName,
          first: p.legalFirstName,
          last: p.legalLastName,
          preferred: p.preferredName
        })
        .from(r)
        .innerJoin(p, eq(p.id, r.subjectPersonId))
        .innerJoin(schema.orgs, eq(schema.orgs.id, r.orgId))
        .leftJoin(schema.seasons, eq(schema.seasons.id, r.seasonId))
        .where(
          and(
            inArray(r.subjectPersonId, subjectIds),
            notInArray(r.status, CLOSED_REGISTRATION_STATES),
            isNull(p.deletedAt)
          )
        )
        .orderBy(desc(r.createdAt))
        .limit(25),
      this.db
        .select({
          personId: schema.teamMemberships.personId,
          seasonId: schema.teamMemberships.seasonId,
          teamName: schema.teams.name,
          orgId: schema.teams.orgId,
          orgName: schema.orgs.displayName,
          seasonName: schema.seasons.name,
          first: p.legalFirstName,
          last: p.legalLastName,
          preferred: p.preferredName
        })
        .from(schema.teamMemberships)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMemberships.teamId))
        .innerJoin(schema.orgs, eq(schema.orgs.id, schema.teams.orgId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teamMemberships.seasonId))
        .innerJoin(p, eq(p.id, schema.teamMemberships.personId))
        .where(
          and(
            inArray(schema.teamMemberships.personId, subjectIds),
            eq(schema.teamMemberships.currentStatus, "active"),
            isNull(p.deletedAt)
          )
        )
        .orderBy(desc(schema.teamMemberships.effectiveFrom))
        .limit(25)
    ]);

    const selfSet = new Set(selfIds);
    const byKey = new Map<string, ComplianceUploadTargetDto>();
    const keyOf = (personId: string, seasonId: string | null, orgId: string) =>
      `${personId}|${seasonId ?? `org:${orgId}`}`;
    for (const reg of regs) {
      const key = keyOf(reg.personId, reg.seasonId, reg.orgId);
      if (byKey.has(key)) continue; // newest registration per person and season wins
      byKey.set(key, {
        personId: reg.personId,
        personName: personName(reg),
        forMinor: !selfSet.has(reg.personId),
        orgId: reg.orgId,
        orgName: reg.orgName ?? null,
        seasonId: reg.seasonId,
        seasonName: reg.seasonName ?? null,
        registrationId: reg.registrationId,
        teamName: null
      });
    }
    for (const m of memberships) {
      const key = keyOf(m.personId, m.seasonId, m.orgId);
      const existing = byKey.get(key);
      if (existing) {
        existing.teamName ??= m.teamName;
        continue;
      }
      byKey.set(key, {
        personId: m.personId,
        personName: personName(m),
        forMinor: !selfSet.has(m.personId),
        orgId: m.orgId,
        orgName: m.orgName ?? null,
        seasonId: m.seasonId,
        seasonName: m.seasonName ?? null,
        registrationId: null,
        teamName: m.teamName
      });
    }
    // The caller's own targets first, then their minors'.
    return [...byKey.values()].sort((a, b) => Number(a.forMinor) - Number(b.forMinor));
  }

  /** Submissions for the caller and their linked minors, newest first, with the latest decision. */
  async listMine(people: UploadPeople): Promise<ComplianceDocumentSubmissionDto[]> {
    const subjectIds = [...new Set([...people.self.map((p) => p.id), ...people.minorIds])];
    if (subjectIds.length === 0) return [];
    const rows = await this.selectSubmissions(
      inArray(schema.complianceDocumentSubmissions.personId, subjectIds),
      { limit: 100 }
    );
    const decisions = await this.decisionsFor(rows.map((r) => r.id));
    return rows.map((r) => this.toDto(r, decisions.get(r.id) ?? []));
  }

  /**
   * Store one file and record it for review. The target (person, org,
   * season, registration) must be one {@link uploadTargets} returns for
   * this caller; anything else is a 404, the same answer whether it does
   * not exist or is someone else's.
   */
  async upload(
    userId: string,
    people: UploadPeople,
    input: UploadComplianceDocumentInput
  ): Promise<{ submission: ComplianceDocumentSubmissionDto; alreadySubmitted: boolean }> {
    const targets = await this.uploadTargets(people);
    const target = targets.find(
      (t) =>
        t.personId === input.personId &&
        t.orgId === input.orgId &&
        (t.seasonId ?? null) === (input.seasonId ?? null) &&
        (t.registrationId ?? null) === (input.registrationId ?? null)
    );
    if (!target) {
      throw new NotFoundException(
        "That season or registration is not one you can upload a document for. Reload the page and pick it again."
      );
    }

    const bytes = Buffer.from(input.dataBase64, "base64");
    const check = checkComplianceUpload(bytes);
    if (!check.ok) throw new BadRequestException(check.reason);

    if (input.documentVersionId) {
      if (input.kind !== "signed_waiver") {
        throw new BadRequestException("Only a scanned signed waiver can name a waiver version.");
      }
      const [version] = await this.db
        .select({ id: schema.documentVersions.id, orgId: schema.documents.orgId })
        .from(schema.documentVersions)
        .innerJoin(schema.documents, eq(schema.documents.id, schema.documentVersions.documentId))
        .where(eq(schema.documentVersions.id, input.documentVersionId))
        .limit(1);
      if (!version || (version.orgId !== null && version.orgId !== target.orgId)) {
        throw new NotFoundException("That waiver version does not exist for this organization.");
      }
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await this.findSameFile(target, sha256);
    if (existing) return this.replayExisting(existing, input.kind);

    let stored: { bucket: string; path: string };
    try {
      stored = await this.storage.uploadComplianceDocument({
        personId: target.personId,
        contentType: check.contentType,
        extension: complianceFileExtension(check.contentType),
        bytes
      });
    } catch (err) {
      this.log.error(`compliance upload storage failed person=${target.personId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "We could not store the file. This is a problem on our side, not your file. Try again in a few minutes."
      );
    }

    let insertedId: string | null;
    try {
      insertedId = await this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(schema.complianceDocumentSubmissions)
          .values({
            personId: target.personId,
            orgId: target.orgId,
            seasonId: target.seasonId,
            registrationId: target.registrationId,
            documentVersionId: input.documentVersionId ?? null,
            kind: input.kind,
            storageBucket: stored.bucket,
            storagePath: stored.path,
            contentType: check.contentType,
            sizeBytes: bytes.length,
            sha256,
            status: "pending",
            submittedByUserId: userId
          })
          .onConflictDoNothing()
          .returning({ id: schema.complianceDocumentSubmissions.id });
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      // The row was not written: do not leave an orphan identity file behind.
      await this.removeStored(stored.bucket, stored.path);
      this.log.error(
        `compliance upload insert failed person=${target.personId} path=${stored.path}: ${(err as Error).message}`
      );
      throw err;
    }
    this.log.log(
      `compliance upload person=${target.personId} org=${target.orgId} season=${target.seasonId ?? "-"} kind=${input.kind} bytes=${bytes.length} rows=${insertedId ? 1 : 0}`
    );

    if (!insertedId) {
      // A concurrent upload of the same file won the unique key: drop ours, answer with theirs.
      await this.removeStored(stored.bucket, stored.path);
      const winner = await this.findSameFile(target, sha256);
      if (!winner) throw new ConflictException("The upload clashed with another one. Try again.");
      return this.replayExisting(winner, input.kind);
    }

    const [readback] = await this.selectSubmissions(
      eq(schema.complianceDocumentSubmissions.id, insertedId),
      { limit: 1 }
    );
    if (!readback || readback.sha256 !== sha256) {
      throw new Error(`compliance upload readback failed for ${insertedId}`);
    }
    return { submission: this.toDto(readback, []), alreadySubmitted: false };
  }

  /** Signed link for the uploader / the person / their guardian. 404 for anyone else. */
  async fileUrlForOwner(
    userId: string,
    people: UploadPeople,
    id: string
  ): Promise<{ url: string; expiresAt: string; contentType: string }> {
    const subjectIds = [...new Set([...people.self.map((p) => p.id), ...people.minorIds])];
    const cds = schema.complianceDocumentSubmissions;
    const ownerWhere = subjectIds.length
      ? or(inArray(cds.personId, subjectIds), eq(cds.submittedByUserId, userId))
      : eq(cds.submittedByUserId, userId);
    const [row] = await this.selectSubmissions(and(eq(cds.id, id), ownerWhere)!, { limit: 1 });
    if (!row) throw new NotFoundException("Document not found");
    return this.signFor(row, userId, "owner");
  }

  // ------------------------------------------------------------------
  // Admin side
  // ------------------------------------------------------------------

  /** Review queue for the caller's scope. `counts` covers every status in scope. */
  async listForAdmin(
    scope: UserScope,
    q: { status?: ComplianceDocumentStatus; limit?: number; cursor?: string }
  ): Promise<{
    items: AdminComplianceDocumentDto[];
    nextCursor: string | null;
    counts: Record<ComplianceDocumentStatus, number>;
  }> {
    const cds = schema.complianceDocumentSubmissions;
    const limit = Math.min(Math.max(q.limit ?? QUEUE_DEFAULT_LIMIT, 1), QUEUE_MAX_LIMIT);
    const cursor = decodeCursor(q.cursor);
    const vis = visibleComplianceSubmissionsWhere(scope, "compliance_document_submissions");
    const where: SQL[] = [];
    if (vis) where.push(vis);
    if (q.status) where.push(eq(cds.status, q.status));
    if (cursor) {
      where.push(
        sql`(${cds.createdAt}, ${cds.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      );
    }
    const rows = await this.selectAdminRows(where.length ? and(...where)! : sql`true`, limit + 1);
    const page = rows.slice(0, limit);
    const decisions = await this.decisionsFor(page.map((r) => r.id));
    const checks = groupBySubmission(await this.idChecksFor(page.map((r) => r.id)));

    const countRows = await this.db
      .select({ status: cds.status, n: sql<number>`count(*)::int` })
      .from(cds)
      .where(vis ?? sql`true`)
      .groupBy(cds.status);
    const counts = Object.fromEntries(COMPLIANCE_DOCUMENT_STATUSES.map((s) => [s, 0])) as Record<
      ComplianceDocumentStatus,
      number
    >;
    for (const c of countRows) {
      if (c.status in counts) counts[c.status as ComplianceDocumentStatus] = Number(c.n);
    }

    const last = page[page.length - 1];
    return {
      items: page.map((r) => this.toAdminDto(r, decisions.get(r.id) ?? [], checks.get(r.id) ?? [])),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
      counts
    };
  }

  /** One queue row, 404 when outside the caller's scope (never leak existence). */
  async getForAdmin(scope: UserScope, id: string): Promise<AdminComplianceDocumentDto> {
    const cds = schema.complianceDocumentSubmissions;
    const vis = visibleComplianceSubmissionsWhere(scope, "compliance_document_submissions");
    const [row] = await this.selectAdminRows(vis ? and(eq(cds.id, id), vis)! : eq(cds.id, id), 1);
    if (!row) throw new NotFoundException("Document not found");
    const decisions = await this.decisionsFor([row.id]);
    const checks = await this.idChecksFor([row.id]);
    return this.toAdminDto(row, decisions.get(row.id) ?? [], checks);
  }

  /**
   * Record an admin decision. Scope is checked first (404 outside). One
   * transaction: lock the submission, validate the transition, append the
   * decision row, set the status, check both writes touched one row.
   * A replayed click (same decision and reason) writes nothing and sends
   * nothing. The response is a fresh read of the row.
   */
  async decide(input: {
    scope: UserScope;
    actorUserId: string;
    id: string;
    decision: ComplianceDocumentDecision;
    reason?: string | null;
  }): Promise<{ submission: AdminComplianceDocumentDto; alreadyDecided: boolean; notified: number }> {
    await this.getForAdmin(input.scope, input.id);
    const cds = schema.complianceDocumentSubmissions;
    const cdd = schema.complianceDocumentDecisions;

    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: cds.id, status: cds.status })
        .from(cds)
        .where(eq(cds.id, input.id))
        .for("update");
      if (!row) throw new NotFoundException("Document not found");
      const [latest] = await tx
        .select({ reason: cdd.reason })
        .from(cdd)
        .where(eq(cdd.submissionId, input.id))
        .orderBy(desc(cdd.decidedAt), desc(cdd.id))
        .limit(1);
      const check = checkComplianceDecision({
        current: row.status as ComplianceDocumentStatus,
        currentReason: latest?.reason ?? null,
        decision: input.decision,
        reason: input.reason
      });
      if (!check.ok) {
        if (check.code === "withdrawn") throw new ConflictException(check.reason);
        throw new BadRequestException(check.reason);
      }
      if (!check.changed) return { changed: false as const, decisionId: null };

      const inserted = await tx
        .insert(cdd)
        .values({
          submissionId: input.id,
          decision: check.next as ComplianceDocumentDecision,
          reason: check.reason,
          decidedByUserId: input.actorUserId
        })
        .returning({ id: cdd.id });
      const updated = await tx
        .update(cds)
        .set({ status: check.next, updatedAt: sql`now()` })
        .where(eq(cds.id, input.id))
        .returning({ id: cds.id });
      if (inserted.length !== 1 || updated.length !== 1) {
        // Throwing rolls both writes back.
        throw new Error(
          `decision write touched decisions=${inserted.length} submissions=${updated.length} for ${input.id}`
        );
      }
      return { changed: true as const, decisionId: inserted[0]!.id };
    });

    this.log.log(
      `compliance decision id=${input.id} decision=${input.decision} by=${input.actorUserId} changed=${result.changed} rows=${result.changed ? 2 : 0}`
    );

    const submission = await this.getForAdmin(input.scope, input.id);
    if (submission.status !== input.decision) {
      this.log.error(
        `compliance decision readback mismatch id=${input.id}: wanted ${input.decision}, read ${submission.status}`
      );
    }
    const notified = result.changed && result.decisionId
      ? await this.notifyDecision(submission, result.decisionId)
      : 0;
    return { submission, alreadyDecided: !result.changed, notified };
  }

  /** Signed link for an admin whose scope covers the document. */
  async fileUrlForAdmin(
    scope: UserScope,
    actorUserId: string,
    id: string
  ): Promise<{ url: string; expiresAt: string; contentType: string }> {
    const cds = schema.complianceDocumentSubmissions;
    const vis = visibleComplianceSubmissionsWhere(scope, "compliance_document_submissions");
    const [row] = await this.selectSubmissions(vis ? and(eq(cds.id, id), vis)! : eq(cds.id, id), {
      limit: 1
    });
    if (!row) throw new NotFoundException("Document not found");
    return this.signFor(row, actorUserId, "admin");
  }

  // ------------------------------------------------------------------
  // Licence barcode check (UC-29 / FR-3.15.5)
  // ------------------------------------------------------------------

  /**
   * Record one licence barcode check against a government ID submission.
   * The browser only decodes the PDF417 image to text; parsing and the
   * comparison with the person on file run here, so the client cannot
   * claim a match. Scope first (404 outside). Stored: result, the fields
   * that disagreed, jurisdiction, expiry, last 4 of the licence number
   * and an HMAC of it. Never the full number, the card's name or DOB.
   * The admin still approves or rejects through `decide`.
   */
  async recordLicenceCheck(input: {
    scope: UserScope;
    actorUserId: string;
    id: string;
    barcodeText: string;
    method: LicenceCheckMethod;
  }): Promise<{ check: LicenceIdCheckDto }> {
    const doc = await this.getForAdmin(input.scope, input.id);
    if (doc.kind !== "government_id") {
      throw new BadRequestException("Licence scans are for government ID documents.");
    }
    const key = this.config.get<string>("ID_CHECK_HASH_KEY")?.trim();
    if (!key || key.length < 32) {
      this.log.error("licence check refused: ID_CHECK_HASH_KEY unset or shorter than 32 characters");
      throw new ServiceUnavailableException(
        "Licence checks are not set up on our side yet (no hashing key). Check the card by eye and decide as usual."
      );
    }
    const parsed = parseAamva(input.barcodeText);
    if (!parsed.ok) throw new BadRequestException(parsed.message);
    const licence = parsed.licence;

    const [person] = await this.db
      .select({
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName,
        dob: schema.persons.dobDate
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, doc.personId))
      .limit(1);
    if (!person) throw new NotFoundException("Document not found");

    const today = new Date().toISOString().slice(0, 10);
    const cmp = compareLicenceToPerson(
      licence,
      { legalFirstName: person.first, legalLastName: person.last, preferredName: person.preferred, dobDate: person.dob },
      today
    );
    const hash = createHmac("sha256", key)
      .update(`${licence.jurisdiction ?? ""}:${licence.licenceNumber}`)
      .digest("hex");
    const fields: LicenceCheckField[] = [...cmp.mismatchedFields];
    const cic = schema.complianceIdChecks;
    const [other] = await this.db
      .select({ id: cic.id })
      .from(cic)
      .where(and(eq(cic.licenceHash, hash), ne(cic.personId, doc.personId)))
      .limit(1);
    if (other) fields.push("seen_on_another_person");
    const result: LicenceCheckResult = fields.length === 0 ? "match" : "mismatch";

    const inserted = await this.db
      .insert(cic)
      .values({
        submissionId: doc.id,
        personId: doc.personId,
        orgId: doc.orgId,
        method: input.method,
        result,
        mismatchedFields: fields,
        documentType: licence.documentType,
        jurisdiction: licence.jurisdiction?.slice(0, 3) ?? null,
        country: licence.country,
        aamvaVersion: licence.version,
        licenceLast4: licenceLast4(licence.licenceNumber),
        licenceHash: hash,
        expiresOn: licence.expiresOn,
        checkedByUserId: input.actorUserId
      })
      .returning({ id: cic.id });
    if (inserted.length !== 1) throw new Error(`licence check insert wrote ${inserted.length} rows for ${doc.id}`);
    const [check] = await this.idChecksFor([doc.id], inserted[0]!.id);
    if (!check) throw new Error(`licence check ${inserted[0]!.id} not read back`);
    this.log.log(
      `licence check id=${check.id} submission=${doc.id} result=${result} fields=${fields.join(",") || "-"} method=${input.method} by=${input.actorUserId}`
    );
    return { check };
  }

  /** Licence checks for these submissions, oldest first (or one by id). */
  private async idChecksFor(submissionIds: string[], onlyId?: string): Promise<LicenceIdCheckDto[]> {
    if (submissionIds.length === 0) return [];
    const cic = schema.complianceIdChecks;
    const rows = await this.db
      .select({
        id: cic.id,
        submissionId: cic.submissionId,
        method: cic.method,
        result: cic.result,
        mismatchedFields: cic.mismatchedFields,
        documentType: cic.documentType,
        jurisdiction: cic.jurisdiction,
        licenceLast4: cic.licenceLast4,
        expiresOn: cic.expiresOn,
        checkedAt: cic.checkedAt,
        checkedByName: schema.profiles.displayName,
        checkedByEmail: schema.profiles.email
      })
      .from(cic)
      .leftJoin(schema.profiles, eq(schema.profiles.id, cic.checkedByUserId))
      .where(onlyId ? eq(cic.id, onlyId) : inArray(cic.submissionId, submissionIds))
      .orderBy(asc(cic.checkedAt), asc(cic.id));
    return rows.map((r) => ({
      id: r.id,
      submissionId: r.submissionId,
      method: r.method as LicenceCheckMethod,
      result: r.result as LicenceCheckResult,
      mismatchedFields: (r.mismatchedFields ?? []) as LicenceCheckField[],
      documentType: r.documentType as "DL" | "ID",
      jurisdiction: r.jurisdiction,
      licenceLast4: r.licenceLast4,
      expiresOn: r.expiresOn,
      checkedAt: r.checkedAt.toISOString(),
      checkedByName: r.checkedByName ?? r.checkedByEmail ?? null
    }));
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async signFor(
    row: SubmissionRow,
    actorUserId: string,
    as: "owner" | "admin"
  ): Promise<{ url: string; expiresAt: string; contentType: string }> {
    let url: string;
    try {
      url = await this.storage.signComplianceDocumentUrl(
        row.storageBucket,
        row.storagePath,
        COMPLIANCE_FILE_URL_TTL_SECONDS
      );
    } catch (err) {
      this.log.error(`compliance file sign failed id=${row.id}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "We could not open the file right now. This is a problem on our side. Try again in a few minutes."
      );
    }
    const expiresAt = new Date(Date.now() + COMPLIANCE_FILE_URL_TTL_SECONDS * 1000).toISOString();
    // Reads are not audited by the interceptor; an identity document's
    // viewers are, here.
    await this.audit.write({
      actorUserId,
      orgId: row.orgId,
      action: "document-submissions.view_file",
      resourceType: "document-submissions",
      resourceId: row.id,
      after: { as, personId: row.personId, kind: row.kind, expiresAt }
    });
    this.log.log(`compliance file signed id=${row.id} as=${as} by=${actorUserId}`);
    return { url, expiresAt, contentType: row.contentType };
  }

  private async removeStored(bucket: string, path: string): Promise<void> {
    try {
      await this.storage.removeComplianceDocument(bucket, path);
    } catch (err) {
      // Logged loudly: an orphan file in the private bucket, no row points at it.
      this.log.error(`orphan compliance file left at ${bucket}/${path}: ${(err as Error).message}`);
    }
  }

  private async findSameFile(
    target: ComplianceUploadTargetDto,
    sha256: string
  ): Promise<SubmissionRow | null> {
    const cds = schema.complianceDocumentSubmissions;
    const [row] = await this.selectSubmissions(
      and(
        eq(cds.personId, target.personId),
        eq(cds.orgId, target.orgId),
        target.seasonId ? eq(cds.seasonId, target.seasonId) : isNull(cds.seasonId),
        eq(cds.sha256, sha256)
      )!,
      { limit: 1 }
    );
    return row ?? null;
  }

  /**
   * The same file again for the same person and target. Waiting or
   * approved: answer with the row we have (no second file, no second
   * row). Rejected or sent back: say why, so the player uploads a
   * different scan instead of the same one.
   */
  private async replayExisting(
    row: SubmissionRow,
    requestedKind: ComplianceDocumentKind
  ): Promise<{ submission: ComplianceDocumentSubmissionDto; alreadySubmitted: boolean }> {
    const decisions = await this.decisionsFor([row.id]);
    const dto = this.toDto(row, decisions.get(row.id) ?? []);
    const when = row.createdAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    if (row.status === "rejected" || row.status === "resubmit_requested") {
      const why = dto.latestDecision?.reason ? `: "${dto.latestDecision.reason}"` : "";
      const what = row.status === "rejected" ? "was rejected" : "was sent back for a new upload";
      throw new ConflictException(
        `You already sent this exact file on ${when} and it ${what}${why}. Upload a different scan or photo.`
      );
    }
    if (row.status === "withdrawn") {
      throw new ConflictException(
        `You withdrew this exact file on ${when}. Upload a different scan or photo.`
      );
    }
    this.log.log(
      `compliance upload replay id=${row.id} status=${row.status} requestedKind=${requestedKind} storedKind=${row.kind}`
    );
    return { submission: dto, alreadySubmitted: true };
  }

  private submissionColumns() {
    const cds = schema.complianceDocumentSubmissions;
    const p = schema.persons;
    return {
      id: cds.id,
      personId: cds.personId,
      orgId: cds.orgId,
      seasonId: cds.seasonId,
      registrationId: cds.registrationId,
      documentVersionId: cds.documentVersionId,
      kind: cds.kind,
      storageBucket: cds.storageBucket,
      storagePath: cds.storagePath,
      contentType: cds.contentType,
      sizeBytes: cds.sizeBytes,
      sha256: cds.sha256,
      status: cds.status,
      submittedByUserId: cds.submittedByUserId,
      createdAt: cds.createdAt,
      updatedAt: cds.updatedAt,
      first: p.legalFirstName,
      last: p.legalLastName,
      preferred: p.preferredName,
      personUserId: p.userId,
      dobDate: p.dobDate,
      orgName: schema.orgs.displayName,
      seasonName: schema.seasons.name
    };
  }

  private async selectSubmissions(where: SQL, opts: { limit: number }): Promise<SubmissionRow[]> {
    const cds = schema.complianceDocumentSubmissions;
    const rows = await this.db
      .select(this.submissionColumns())
      .from(cds)
      .innerJoin(schema.persons, eq(schema.persons.id, cds.personId))
      .innerJoin(schema.orgs, eq(schema.orgs.id, cds.orgId))
      .leftJoin(schema.seasons, eq(schema.seasons.id, cds.seasonId))
      .where(where)
      .orderBy(desc(cds.createdAt), desc(cds.id))
      .limit(opts.limit);
    return rows as SubmissionRow[];
  }

  private async selectAdminRows(where: SQL, limit: number): Promise<AdminRow[]> {
    const cds = schema.complianceDocumentSubmissions;
    const rows = await this.db
      .select({
        ...this.submissionColumns(),
        submittedByName: schema.profiles.displayName,
        submittedByEmail: schema.profiles.email,
        divisionName: schema.divisions.name,
        divisionGender: schema.divisions.genderEligibility,
        ageGroupLabel: schema.ageGroups.label,
        birthYearMin: schema.ageGroups.birthYearMin,
        birthYearMax: schema.ageGroups.birthYearMax
      })
      .from(cds)
      .innerJoin(schema.persons, eq(schema.persons.id, cds.personId))
      .innerJoin(schema.orgs, eq(schema.orgs.id, cds.orgId))
      .leftJoin(schema.seasons, eq(schema.seasons.id, cds.seasonId))
      .leftJoin(schema.registrations, eq(schema.registrations.id, cds.registrationId))
      .leftJoin(schema.divisions, eq(schema.divisions.id, schema.registrations.divisionId))
      .leftJoin(schema.ageGroups, eq(schema.ageGroups.id, schema.divisions.ageGroupId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, cds.submittedByUserId))
      .where(where)
      .orderBy(desc(cds.createdAt), desc(cds.id))
      .limit(limit);
    return rows as AdminRow[];
  }

  private async decisionsFor(ids: string[]): Promise<Map<string, ComplianceDocumentDecisionDto[]>> {
    const out = new Map<string, ComplianceDocumentDecisionDto[]>();
    if (ids.length === 0) return out;
    const cdd = schema.complianceDocumentDecisions;
    const rows = await this.db
      .select({
        submissionId: cdd.submissionId,
        decision: cdd.decision,
        reason: cdd.reason,
        decidedAt: cdd.decidedAt,
        decidedByName: schema.profiles.displayName
      })
      .from(cdd)
      .leftJoin(schema.profiles, eq(schema.profiles.id, cdd.decidedByUserId))
      .where(inArray(cdd.submissionId, ids))
      .orderBy(asc(cdd.decidedAt), asc(cdd.id));
    for (const r of rows) {
      const list = out.get(r.submissionId) ?? [];
      list.push({
        decision: r.decision as ComplianceDocumentDecision,
        reason: r.reason ?? null,
        decidedAt: r.decidedAt.toISOString(),
        decidedByName: r.decidedByName ?? null
      });
      out.set(r.submissionId, list);
    }
    return out;
  }

  private toDto(r: SubmissionRow, decisions: ComplianceDocumentDecisionDto[]): ComplianceDocumentSubmissionDto {
    return {
      id: r.id,
      personId: r.personId,
      personName: personName(r),
      orgId: r.orgId,
      orgName: r.orgName ?? null,
      seasonId: r.seasonId,
      seasonName: r.seasonName ?? null,
      registrationId: r.registrationId,
      documentVersionId: r.documentVersionId,
      kind: r.kind as ComplianceDocumentKind,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      status: r.status as ComplianceDocumentStatus,
      submittedByUserId: r.submittedByUserId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      latestDecision: decisions.length ? decisions[decisions.length - 1]! : null
    };
  }

  private toAdminDto(
    r: AdminRow,
    decisions: ComplianceDocumentDecisionDto[],
    idChecks: LicenceIdCheckDto[] = []
  ): AdminComplianceDocumentDto {
    const base = this.toDto(r, decisions);
    return {
      ...base,
      dobDate: r.dobDate ?? null,
      submittedByName: r.submittedByName ?? r.submittedByEmail ?? null,
      submittedByOther: !!r.submittedByUserId && r.submittedByUserId !== r.personUserId,
      divisionName: r.divisionName ?? null,
      divisionGender: r.divisionGender ?? null,
      ageGroupLabel: r.ageGroupLabel ?? null,
      birthYearMin: r.birthYearMin ?? null,
      birthYearMax: r.birthYearMax ?? null,
      sha256: r.sha256,
      decisions,
      idChecks
    };
  }

  /**
   * Tell the person (or the guardian who uploaded for a minor) and the
   * captain(s) of the person's team in that season. One row per person
   * through the shared NotificationService: email when the account has
   * an address, in-app otherwise; the inbox lists both. Keyed on the
   * decision row, so a retried request never doubles up.
   */
  private async notifyDecision(
    s: AdminComplianceDocumentDto,
    decisionId: string
  ): Promise<number> {
    const decision = s.status as ComplianceDocumentDecision;
    const reason = s.latestDecision?.reason ?? null;
    const documentLabel = COMPLIANCE_DOCUMENT_KIND_LABELS[s.kind];
    const decisionLabel = COMPLIANCE_DOCUMENT_STATUS_LABELS[decision];
    const forLabel = [s.seasonName, s.orgName].filter(Boolean).join(" · ") || "your organization";
    const nextStep =
      decision === "approved"
        ? "Nothing else to do for this document."
        : decision === "resubmit_requested"
          ? "Upload a new file on Waivers & documents in the player app."
          : "If you think this is wrong, contact your league admin. You can upload a different file on Waivers & documents.";

    // Person + the uploader (a guardian, for a minor), and the captains of
    // the teams the person plays on (shared with eligibility waivers).
    const { direct, captains } = await complianceRecipients(this.db, {
      personId: s.personId,
      actingUserId: s.submittedByUserId,
      seasonId: s.seasonId
    });

    const jobs: Array<Promise<unknown>> = [];
    for (const d of direct) {
      jobs.push(
        this.notify.queue({
          orgId: s.orgId,
          templateCode: "compliance.document.decided",
          channel: d.email ? "email" : "in_app",
          idempotencyKey: `compliance.document.decided:${decisionId}:${d.personId}`,
          recipientPersonId: d.personId,
          recipientEmail: d.email ?? null,
          payload: {
            documentLabel,
            decisionLabel,
            personName: s.personName,
            forLabel,
            reasonLine: reason ? `${decision === "approved" ? "Note" : "Reason"}: ${reason}` : "",
            nextStep,
            seasonId: s.seasonId,
            submissionId: s.id
          },
          sourceEvent: "compliance.document.decided"
        })
      );
    }
    for (const c of captains) {
      jobs.push(
        this.notify.queue({
          orgId: s.orgId,
          templateCode: "compliance.document.decided.captain",
          channel: c.email ? "email" : "in_app",
          idempotencyKey: `compliance.document.decided.captain:${decisionId}:${c.personId}`,
          recipientPersonId: c.personId,
          recipientEmail: c.email ?? null,
          payload: {
            personName: s.personName,
            documentLabel,
            decisionLabel: decisionLabel.toLowerCase(),
            teamName: c.teamName,
            forLabel,
            seasonId: s.seasonId,
            submissionId: s.id
          },
          sourceEvent: "compliance.document.decided.captain"
        })
      );
    }
    const results = await Promise.all(jobs);
    const queued = results.filter(Boolean).length;
    this.log.log(
      `compliance.document.decided id=${s.id} decision=${decision} recipients=${jobs.length} queued=${queued}`
    );
    if (queued < jobs.length) {
      this.log.warn(`compliance.document.decided id=${s.id}: ${jobs.length - queued} notification(s) not queued`);
    }
    return queued;
  }
}
