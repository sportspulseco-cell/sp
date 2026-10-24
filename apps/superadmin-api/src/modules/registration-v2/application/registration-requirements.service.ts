import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  registrationWindowMessage,
  registrationWindowState,
  resolveRegistrationWaivers,
  signatureNameMatches,
  type FormWaiversConfig,
  type RegistrationDocumentKey,
  type RegistrationDocumentRequirement,
  type RegistrationWindowState
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;

export type SeasonRow = typeof schema.seasons.$inferSelect;

/** The registration fields the requirement rules read. */
export interface RegistrationRef {
  id: string;
  seasonId: string | null;
  formVersionId: string;
  subjectPersonId: string;
}

export interface SeasonFormVersion {
  formId: string;
  versionId: string;
  schema: unknown;
}

/** One required document and whether the registrant has signed it. */
export interface RegistrationDocumentStatus {
  key: RegistrationDocumentKey;
  kind: RegistrationDocumentRequirement["documentKind"];
  title: string;
  contentHtml: string;
  signMode: RegistrationDocumentRequirement["signMode"];
  /** Null until someone signs this exact text for the first time. */
  documentVersionId: string | null;
  signed: boolean;
  signedAt: string | null;
  signatureId: string | null;
}

/**
 * The SQL rule for "this registration form belongs to the season":
 * same org, and either bound to the season or a league-wide form of the
 * season's league (REG-25: league forms used to match every season of
 * every org). Takes columns (join queries) or values (single season).
 */
export function formBelongsToSeason(season: {
  id: unknown;
  leagueId: unknown;
  orgId: unknown;
}): SQL {
  const f = schema.registrationForms;
  return sql`(${f.purpose} = 'season_registration' AND ${f.orgId} = ${season.orgId} AND (${f.seasonId} = ${season.id} OR (${f.scope} = 'league' AND ${f.seasonId} IS NULL AND ${f.scopeId} = ${season.leagueId})))`;
}

/** formBelongsToSeason + published + not deleted: what the funnel serves. */
export function seasonRegistrationFormMatch(season: {
  id: unknown;
  leagueId: unknown;
  orgId: unknown;
}): SQL {
  const f = schema.registrationForms;
  return sql`(${formBelongsToSeason(season)} AND ${f.deletedAt} IS NULL AND ${f.activeVersionId} IS NOT NULL)`;
}

/** First valid IP from x-forwarded-for, else the socket address; null if neither parses. */
export function requestClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const fwd = req.headers?.["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  if (first && isIP(first)) return first;
  const ip = req.ip?.replace(/^::ffff:/, "");
  return ip && isIP(ip) ? ip : null;
}

export function requestUserAgent(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const ua = req.headers?.["user-agent"];
  const s = Array.isArray(ua) ? ua[0] : ua;
  return s ? s.slice(0, 500) : null;
}

const MATERIALIZED_NAME_SUFFIX = " (form)";

function contentHash(req: RegistrationDocumentRequirement): string {
  // Same formula the funnel's inline-waiver writer used, so signatures
  // stored before this change still match their text.
  return createHash("sha256").update(`${req.documentKind}\n${req.content}`).digest("hex");
}

/**
 * Registration requirements: which season form a registration binds to
 * (REG-8, REG-25), whether the season takes registrations now (REG-16),
 * which documents must be signed before submission (REG-5), and the one
 * writer that records those signatures. Used by the public funnel and by
 * the player's /compliance page (COMP-4), so both read and write the same
 * records.
 */
@Injectable()
export class RegistrationRequirementsService {
  private readonly log = new Logger(RegistrationRequirementsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async loadSeason(seasonId: string, exec: Exec = this.db): Promise<SeasonRow | null> {
    const [season] = await exec
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    return season ?? null;
  }

  windowOf(season: SeasonRow, now: Date = new Date()): {
    state: RegistrationWindowState;
    message: string | null;
  } {
    return {
      state: registrationWindowState(season, now),
      message: registrationWindowMessage(season, now)
    };
  }

  /** 409 with "Registration for X opens on ..." when the season is not taking registrations. */
  assertRegistrationOpen(season: SeasonRow, now: Date = new Date()): void {
    const w = this.windowOf(season, now);
    if (w.state === "open") return;
    this.log.log(`refused: registration window ${w.state} season=${season.id}`);
    throw new ConflictException(w.message ?? "Registration is not open.");
  }

  /** The season's published season_registration form version, season-bound first. */
  async resolveActiveFormVersion(
    season: Pick<SeasonRow, "id" | "leagueId" | "orgId">,
    exec: Exec = this.db
  ): Promise<SeasonFormVersion | null> {
    const f = schema.registrationForms;
    const v = schema.registrationFormVersions;
    const [row] = await exec
      .select({ formId: f.id, versionId: v.id, schema: v.schema })
      .from(f)
      .innerJoin(v, and(eq(v.id, f.activeVersionId), eq(v.formId, f.id)))
      .where(seasonRegistrationFormMatch(season))
      .orderBy(sql`(${f.seasonId} IS NOT NULL) DESC`, desc(v.publishedAt), desc(f.updatedAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * REG-8: the version a new registration binds to. The funnel sends the
   * version it rendered; it must be the season's active version. 422 when
   * the season has no published form, 409 when the page is stale or the
   * id belongs to another form.
   */
  async bindFormVersion(
    season: SeasonRow,
    requestedVersionId: string | null | undefined
  ): Promise<SeasonFormVersion> {
    const active = await this.resolveActiveFormVersion(season);
    if (!active) {
      throw new UnprocessableEntityException(
        `${season.name} has no published registration form yet. The league must publish it before players can register.`
      );
    }
    if (requestedVersionId && requestedVersionId !== active.versionId) {
      this.log.warn(
        `refused: requested form version ${requestedVersionId} is not the active version ${active.versionId} of season=${season.id}`
      );
      throw new ConflictException(
        "The registration form changed since this page was opened. Reload the page to continue."
      );
    }
    return active;
  }

  /**
   * Waiver settings of the form a registration is bound to. A registration
   * bound to a form of another season (REG-8 rows created before the fix)
   * falls back to the season's current form, never to the foreign one.
   */
  private async formWaiversFor(
    reg: RegistrationRef,
    season: SeasonRow,
    exec: Exec
  ): Promise<Partial<FormWaiversConfig> | null> {
    const f = schema.registrationForms;
    const v = schema.registrationFormVersions;
    const [bound] = await exec
      .select({ schema: v.schema })
      .from(v)
      .innerJoin(f, eq(f.id, v.formId))
      .where(and(eq(v.id, reg.formVersionId), formBelongsToSeason(season)))
      .limit(1);
    const def = (bound ?? (await this.resolveActiveFormVersion(season, exec)))?.schema as
      | { waivers?: Partial<FormWaiversConfig> }
      | null
      | undefined;
    return def?.waivers ?? null;
  }

  private async requiredFor(
    reg: RegistrationRef,
    exec: Exec
  ): Promise<{ season: SeasonRow; required: RegistrationDocumentRequirement[] }> {
    if (!reg.seasonId) {
      throw new UnprocessableEntityException(
        "This registration is not tied to a season, so its waivers cannot be worked out. Contact the league."
      );
    }
    const season = await this.loadSeason(reg.seasonId, exec);
    if (!season) throw new NotFoundException("Season not found");
    const formWaivers = await this.formWaiversFor(reg, season, exec);
    return {
      season,
      required: resolveRegistrationWaivers(season.config as Record<string, unknown>, formWaivers)
        .required
    };
  }

  /** What a new registrant of this season will be asked to sign (no signature state). */
  async previewDocuments(season: SeasonRow): Promise<RegistrationDocumentRequirement[]> {
    const active = await this.resolveActiveFormVersion(season);
    const def = active?.schema as { waivers?: Partial<FormWaiversConfig> } | null | undefined;
    return resolveRegistrationWaivers(season.config as Record<string, unknown>, def?.waivers ?? null)
      .required;
  }

  /** Every stored version holding exactly this text, keyed by requirement. */
  private async findVersionIds(
    orgId: string,
    required: RegistrationDocumentRequirement[],
    exec: Exec
  ): Promise<Map<RegistrationDocumentKey, string[]>> {
    const out = new Map<RegistrationDocumentKey, string[]>();
    if (required.length === 0) return out;
    const d = schema.documents;
    const v = schema.documentVersions;
    const rows = await exec
      .select({ id: v.id, kind: d.kind, name: d.name, hash: v.contentHash, createdAt: v.createdAt })
      .from(v)
      .innerJoin(d, eq(d.id, v.documentId))
      .where(
        and(
          eq(d.orgId, orgId),
          isNull(d.deletedAt),
          inArray(
            d.name,
            required.map((r) => `${r.title}${MATERIALIZED_NAME_SUFFIX}`)
          ),
          inArray(v.contentHash, required.map(contentHash))
        )
      )
      .orderBy(v.createdAt);
    for (const r of required) {
      const name = `${r.title}${MATERIALIZED_NAME_SUFFIX}`;
      const hash = contentHash(r);
      out.set(
        r.key,
        rows.filter((x) => x.kind === r.documentKind && x.name === name && x.hash === hash).map((x) => x.id)
      );
    }
    return out;
  }

  /** Required documents of a registration and the subject's signatures (revoked ones do not count). */
  async listDocuments(
    reg: RegistrationRef,
    exec: Exec = this.db
  ): Promise<{ season: SeasonRow; documents: RegistrationDocumentStatus[] }> {
    const { season, required } = await this.requiredFor(reg, exec);
    const versions = await this.findVersionIds(season.orgId, required, exec);
    const allIds = [...versions.values()].flat();
    const sigs =
      allIds.length === 0
        ? []
        : await exec
            .select({
              id: schema.consentSignatures.id,
              versionId: schema.consentSignatures.documentVersionId,
              signedAt: schema.consentSignatures.signedAt
            })
            .from(schema.consentSignatures)
            .where(
              and(
                eq(schema.consentSignatures.personId, reg.subjectPersonId),
                inArray(schema.consentSignatures.documentVersionId, allIds),
                isNull(schema.consentSignatures.revokedAt)
              )
            );
    const documents = required.map((r): RegistrationDocumentStatus => {
      const ids = versions.get(r.key) ?? [];
      const sig = sigs.find((s) => ids.includes(s.versionId)) ?? null;
      return {
        key: r.key,
        kind: r.documentKind,
        title: r.title,
        contentHtml: r.content,
        signMode: r.signMode,
        documentVersionId: sig?.versionId ?? ids[0] ?? null,
        signed: !!sig,
        signedAt: sig?.signedAt.toISOString() ?? null,
        signatureId: sig?.id ?? null
      };
    });
    return { season, documents };
  }

  /**
   * REG-5 + REG-16 gate for submitting (pay or offline). Throws 409 with
   * a sentence that names what is missing. Call before any write.
   */
  async assertSubmittable(reg: RegistrationRef, now: Date = new Date()): Promise<void> {
    const { season, documents } = await this.listDocuments(reg);
    this.assertRegistrationOpen(season, now);
    const missing = documents.filter((d) => !d.signed);
    if (missing.length === 0) return;
    this.log.log(
      `refused submit: registration=${reg.id} unsigned=${missing.map((m) => m.key).join(",")}`
    );
    throw new ConflictException(`${unsignedSentence(missing)} before you submit your registration.`);
  }

  /**
   * The one writer for registration document signatures (funnel and
   * /compliance). One transaction: find-or-create the document version
   * for this exact text, then insert the signature (idempotent on the
   * person + version unique index), then read it back.
   */
  async signRequirement(input: {
    registration: RegistrationRef;
    key: RegistrationDocumentKey;
    signatureName: string;
    expectedSignerName: string;
    signedByUserId: string | null;
    ipAddr: string | null;
    userAgent: string | null;
  }): Promise<{
    signatureId: string;
    documentVersionId: string;
    signedAt: string;
    created: boolean;
    documents: RegistrationDocumentStatus[];
  }> {
    const reg = input.registration;
    const { season, required } = await this.requiredFor(reg, this.db);
    const req = required.find((r) => r.key === input.key);
    if (!req) {
      throw new UnprocessableEntityException(
        `This registration does not ask for the ${input.key === "code_of_conduct" ? "Code of conduct" : "Liability waiver"}.`
      );
    }
    if (!signatureNameMatches(input.signatureName, input.expectedSignerName)) {
      throw new UnprocessableEntityException(
        `To sign the ${req.title}, type your full legal name exactly as ${input.expectedSignerName.trim()}.`
      );
    }

    const result = await this.db.transaction(async (tx) => {
      // Serialise find-or-create of the document rows per org + kind.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`registration-doc:${season.orgId}:${req.documentKind}`}))`
      );
      const versionId = await this.materializeVersion(tx, season.orgId, req);
      const label =
        req.signMode === "acknowledge"
          ? `Acknowledged by ${input.signatureName.trim()}`
          : input.signatureName.trim();
      const inserted = await tx
        .insert(schema.consentSignatures)
        .values({
          personId: reg.subjectPersonId,
          documentVersionId: versionId,
          signedByUserId: input.signedByUserId,
          ipAddr: input.ipAddr,
          userAgent: input.userAgent,
          signatureBlobUrl: `data:text/plain,${encodeURIComponent(label)}`
        })
        .onConflictDoNothing({
          target: [schema.consentSignatures.personId, schema.consentSignatures.documentVersionId]
        })
        .returning();
      const [row] =
        inserted.length > 0
          ? inserted
          : await tx
              .select()
              .from(schema.consentSignatures)
              .where(
                and(
                  eq(schema.consentSignatures.personId, reg.subjectPersonId),
                  eq(schema.consentSignatures.documentVersionId, versionId)
                )
              )
              .limit(1);
      if (!row) throw new Error(`signature readback empty registration=${reg.id} version=${versionId}`);
      if (row.revokedAt) {
        throw new ConflictException(
          `A league admin revoked the earlier signature on this ${req.title}. Contact your league to have it reinstated.`
        );
      }
      return { row, created: inserted.length > 0 };
    });

    this.log.log(
      `signature ${result.created ? "stored" : "already on file"} registration=${reg.id} key=${input.key} version=${result.row.documentVersionId} person=${reg.subjectPersonId} signer=${input.signedByUserId ?? "-"}`
    );
    const { documents } = await this.listDocuments(reg);
    return {
      signatureId: result.row.id,
      documentVersionId: result.row.documentVersionId,
      signedAt: result.row.signedAt.toISOString(),
      created: result.created,
      documents
    };
  }

  private async materializeVersion(
    tx: Tx,
    orgId: string,
    req: RegistrationDocumentRequirement
  ): Promise<string> {
    const name = `${req.title}${MATERIALIZED_NAME_SUFFIX}`;
    const hash = contentHash(req);
    const d = schema.documents;
    const v = schema.documentVersions;

    const [existing] = await tx
      .select({ id: v.id })
      .from(v)
      .innerJoin(d, eq(d.id, v.documentId))
      .where(
        and(
          eq(d.orgId, orgId),
          eq(d.kind, req.documentKind),
          eq(d.name, name),
          isNull(d.deletedAt),
          eq(v.contentHash, hash)
        )
      )
      .orderBy(v.createdAt)
      .limit(1);
    if (existing) return existing.id;

    let [doc] = await tx
      .select({ id: d.id })
      .from(d)
      .where(and(eq(d.orgId, orgId), eq(d.kind, req.documentKind), eq(d.name, name), isNull(d.deletedAt)))
      .orderBy(d.createdAt)
      .limit(1);
    if (!doc) {
      [doc] = await tx
        .insert(d)
        .values({
          orgId,
          kind: req.documentKind,
          name,
          description: "Text the registrant signs, from the season setup or the registration form."
        })
        .returning({ id: d.id });
    }
    const [max] = await tx
      .select({ n: v.versionNumber })
      .from(v)
      .where(eq(v.documentId, doc!.id))
      .orderBy(desc(v.versionNumber))
      .limit(1);
    const [created] = await tx
      .insert(v)
      .values({
        documentId: doc!.id,
        versionNumber: (max?.n ?? 0) + 1,
        contentHtml: req.content,
        contentHash: hash,
        languageCode: "en",
        effectiveFrom: new Date()
      })
      .returning({ id: v.id });
    await tx
      .update(d)
      .set({ activeVersionId: created!.id, updatedAt: new Date() })
      .where(eq(d.id, doc!.id));
    this.log.log(`document version created org=${orgId} kind=${req.documentKind} version=${created!.id}`);
    return created!.id;
  }
}

/** "Sign the Liability waiver and accept the Code of conduct" */
export function unsignedSentence(missing: Array<Pick<RegistrationDocumentStatus, "title" | "signMode">>): string {
  const parts = missing.map((m) =>
    m.signMode === "acknowledge" ? `accept the ${m.title}` : `sign the ${m.title}`
  );
  const s = parts.join(" and ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
