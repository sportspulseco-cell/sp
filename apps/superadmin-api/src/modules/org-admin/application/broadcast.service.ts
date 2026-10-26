import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { complianceFileExtension, detectComplianceFileType } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { SupabaseAdminService } from "../../../shared/auth/supabase-admin.service";
import { ADMIN_SCOPE_ROLE_CODES, loadAdminScope } from "../../../shared/auth/scope";
import { holdsRoleInOrg } from "../../../shared/auth/org-permission";
import { announcementReach, reachHolds, reachIsEmpty } from "../../../shared/audience/announcement-reach";
import { assertTargetInOrg, type OrgTargetType, teamIdsInTarget } from "../../../shared/audience/org-targets";
import {
  resolveAnnouncementRecipients,
  sendAnnouncement,
  type AnnouncementAudience,
  type AnnouncementChannel,
  type AnnouncementResult,
  type AnnouncementTarget
} from "../../../shared/audience/announcements";
import { NotificationService } from "../../communications/application/notification.service";

/** What the composer sends, now or later. */
export interface BroadcastRequest {
  orgId: string;
  audiences: AnnouncementAudience[];
  targetType: OrgTargetType;
  /** The org id for the whole org. */
  targetId: string;
  subject: string;
  body: string;
  channels: AnnouncementChannel[];
  attachmentIds: string[];
}

export interface ScheduledBroadcastDto {
  id: string;
  orgId: string;
  idempotencyKey: string;
  sendAt: string;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  subject: string;
  targetType: OrgTargetType;
  audiences: AnnouncementAudience[];
  channels: AnnouncementChannel[];
  attachments: Array<{ id: string; fileName: string }>;
  result: AnnouncementResult | null;
  lastError: string | null;
  createdByName: string | null;
  createdAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
}

export interface BroadcastAttachmentDto {
  id: string;
  orgId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Earliest a scheduled send may be, and the furthest ahead. */
const MIN_LEAD_MS = 2 * 60 * 1000;
const MAX_LEAD_MS = 180 * 24 * 60 * 60 * 1000;
/** Attachment links in a sent announcement work this long. */
const LINK_TTL_SECONDS = 60 * 60 * 24 * 90;
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_ATTACHMENTS = 5;
/** A run that died mid-send is claimed again after this long. */
const STALE_CLAIM_MINUTES = 10;
const MAX_ATTEMPTS = 3;

/**
 * UC-19 announcements: the reach check, the audience, attachments and
 * schedule-for-later, shared by the send-now endpoint and the cron job so
 * both apply the same rules. The server owns everything: the target must
 * sit in the org and in the sender's reach at compose time AND again at
 * send time (a sender who lost the role sends nothing).
 */
@Injectable()
export class BroadcastService {
  private readonly log = new Logger(BroadcastService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly storage: SupabaseAdminService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  // ------------------------------------------------------------------
  // Reach
  // ------------------------------------------------------------------

  /** 404 outside the org or the caller's reach; 403 for a role that cannot send. */
  async assertCanSend(
    userId: string,
    isSuperAdmin: boolean,
    orgId: string,
    targetType: OrgTargetType,
    targetId: string
  ): Promise<void> {
    await assertTargetInOrg(this.db, targetType, targetId, orgId);
    if (isSuperAdmin) return;
    const reach = await announcementReach(this.db, userId, orgId);
    if (reachIsEmpty(reach)) {
      if (await holdsRoleInOrg(this.db, userId, orgId, ADMIN_SCOPE_ROLE_CODES)) {
        throw new ForbiddenException("Your role cannot send announcements here. Ask your org admin.");
      }
      throw new NotFoundException("Org not found");
    }
    if (!reachHolds(reach, targetType, targetId)) {
      if (targetType === "org") {
        throw new ForbiddenException(
          "You can send to your own leagues, not the whole organisation. Pick one of your leagues."
        );
      }
      throw new NotFoundException("Target not found");
    }
  }

  /** The caller reaches some part of this org (any target). 404 otherwise. */
  private async assertReachesOrg(userId: string, isSuperAdmin: boolean, orgId: string): Promise<void> {
    if (isSuperAdmin) return;
    const reach = await announcementReach(this.db, userId, orgId);
    if (reachIsEmpty(reach)) throw new NotFoundException("Org not found");
  }

  // ------------------------------------------------------------------
  // Send now / schedule / cancel
  // ------------------------------------------------------------------

  async sendNow(args: {
    userId: string;
    request: BroadcastRequest;
    idempotencyKey?: string;
    publicBase: string;
  }): Promise<AnnouncementResult & { attachments: number }> {
    const key = args.idempotencyKey;
    const attachments = await this.bindAttachments(args.request.orgId, args.request.attachmentIds, key ?? null);
    return this.deliver(args.request, key, attachments, args.publicBase, false);
  }

  /** Store the announcement for later. Same key again returns the stored row (no second schedule). */
  async schedule(args: {
    userId: string;
    request: BroadcastRequest;
    idempotencyKey: string;
    sendAt: Date;
  }): Promise<{ scheduled: ScheduledBroadcastDto; idempotent: boolean }> {
    const lead = args.sendAt.getTime() - Date.now();
    if (!Number.isFinite(lead)) throw new BadRequestException("Pick a valid send time.");
    if (lead < MIN_LEAD_MS) throw new BadRequestException("Pick a send time at least 2 minutes from now, or send it now.");
    if (lead > MAX_LEAD_MS) throw new BadRequestException("Pick a send time within the next 180 days.");

    const sb = schema.scheduledBroadcasts;
    const [existing] = await this.db.select({ id: sb.id }).from(sb).where(eq(sb.idempotencyKey, args.idempotencyKey)).limit(1);
    if (existing) return { scheduled: await this.getScheduled(existing.id), idempotent: true };

    await this.bindAttachments(args.request.orgId, args.request.attachmentIds, args.idempotencyKey);
    const inserted = await this.db
      .insert(sb)
      .values({
        orgId: args.request.orgId,
        idempotencyKey: args.idempotencyKey,
        createdByUserId: args.userId,
        sendAt: args.sendAt,
        status: "scheduled",
        request: args.request as unknown as Record<string, unknown>
      })
      .onConflictDoNothing({ target: sb.idempotencyKey })
      .returning({ id: sb.id });
    const id = inserted[0]?.id ?? (await this.db.select({ id: sb.id }).from(sb).where(eq(sb.idempotencyKey, args.idempotencyKey)).limit(1))[0]?.id;
    if (!id) throw new Error(`scheduled broadcast ${args.idempotencyKey} not written`);
    this.log.log(
      `broadcast scheduled id=${id} org=${args.request.orgId} sendAt=${args.sendAt.toISOString()} by=${args.userId} rows=${inserted.length}`
    );
    return { scheduled: await this.getScheduled(id), idempotent: inserted.length === 0 };
  }

  /** Cancel while still waiting. 404 outside reach; 409 once it started or ended. */
  async cancel(userId: string, isSuperAdmin: boolean, id: string): Promise<ScheduledBroadcastDto> {
    const row = await this.getScheduled(id);
    await this.assertReachesOrg(userId, isSuperAdmin, row.orgId);
    const sb = schema.scheduledBroadcasts;
    const updated = await this.db
      .update(sb)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledByUserId: userId, updatedAt: new Date() })
      .where(and(eq(sb.id, id), eq(sb.status, "scheduled")))
      .returning({ id: sb.id });
    this.log.log(`broadcast cancel id=${id} by=${userId} rows=${updated.length}`);
    const after = await this.getScheduled(id);
    if (updated.length === 0 && after.status !== "cancelled") {
      throw new ConflictException(
        after.status === "sent" ? "This announcement has already been sent." : `This announcement is ${after.status} and can no longer be cancelled.`
      );
    }
    return after;
  }

  async listScheduled(userId: string, isSuperAdmin: boolean, orgId: string): Promise<ScheduledBroadcastDto[]> {
    await this.assertReachesOrg(userId, isSuperAdmin, orgId);
    const sb = schema.scheduledBroadcasts;
    const rows = await this.db
      .select({ id: sb.id })
      .from(sb)
      .where(
        and(
          eq(sb.orgId, orgId),
          or(
            inArray(sb.status, ["scheduled", "sending", "failed"]),
            sql`${sb.updatedAt} > now() - interval '7 days'`
          )
        )
      )
      .orderBy(asc(sb.sendAt))
      .limit(100);
    return Promise.all(rows.map((r) => this.getScheduled(r.id)));
  }

  /** Visible to the caller only when they reach its org. */
  async getScheduledFor(userId: string, isSuperAdmin: boolean, id: string): Promise<ScheduledBroadcastDto> {
    const row = await this.getScheduled(id);
    await this.assertReachesOrg(userId, isSuperAdmin, row.orgId);
    return row;
  }

  /**
   * The durable job: claim due rows and send them. Claim is one UPDATE
   * with SKIP LOCKED, so two overlapping runs never take the same row.
   * A row left in `sending` by a crashed run is claimed again after
   * STALE_CLAIM_MINUTES; the send itself is idempotent per person and
   * channel, so a resumed send never doubles a message.
   */
  async runDue(publicBase: string): Promise<{ claimed: number; sent: number; failed: number; retried: number }> {
    const claimed = (await this.db.execute(sql`
      UPDATE scheduled_broadcasts sb
         SET status = 'sending', claimed_at = now(), attempt_count = sb.attempt_count + 1, updated_at = now()
       WHERE sb.id IN (
         SELECT id FROM scheduled_broadcasts
          WHERE (status = 'scheduled' AND send_at <= now())
             OR (status = 'sending' AND claimed_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES}))
          ORDER BY send_at
          LIMIT 20
          FOR UPDATE SKIP LOCKED
       )
      RETURNING sb.id, sb.org_id, sb.idempotency_key, sb.created_by_user_id, sb.request, sb.attempt_count
    `)) as unknown as Array<{
      id: string;
      org_id: string;
      idempotency_key: string;
      created_by_user_id: string | null;
      request: BroadcastRequest;
      attempt_count: number;
    }>;
    let sent = 0;
    let failed = 0;
    let retried = 0;
    const sb = schema.scheduledBroadcasts;
    for (const row of claimed) {
      try {
        if (!row.created_by_user_id) throw new ForbiddenException("The sender's account no longer exists.");
        const scope = await loadAdminScope(this.db, row.created_by_user_id);
        const req = row.request;
        await this.assertCanSend(row.created_by_user_id, scope.isSuperAdmin, row.org_id, req.targetType, req.targetId);
        const attachments = await this.attachmentsForKey(row.idempotency_key);
        const result = await this.deliver(req, row.idempotency_key, attachments, publicBase, true);
        const done = await this.db
          .update(sb)
          .set({ status: "sent", sentAt: new Date(), result: result as unknown as Record<string, unknown>, lastError: null, updatedAt: new Date() })
          .where(and(eq(sb.id, row.id), eq(sb.status, "sending")))
          .returning({ id: sb.id });
        this.log.log(`broadcast due id=${row.id} sent queued=${result.queued} recipients=${result.recipients} rows=${done.length}`);
        sent++;
      } catch (e) {
        const msg = (e as Error).message;
        // A permission or target refusal is final; anything else retries.
        const final =
          e instanceof ForbiddenException || e instanceof NotFoundException || row.attempt_count >= MAX_ATTEMPTS;
        await this.db
          .update(sb)
          .set({ status: final ? "failed" : "scheduled", lastError: msg.slice(0, 500), updatedAt: new Date() })
          .where(eq(sb.id, row.id));
        this.log.warn(`broadcast due id=${row.id} ${final ? "failed" : "will retry"}: ${msg}`);
        if (final) failed++;
        else retried++;
      }
    }
    this.log.log(`broadcast cron: claimed=${claimed.length} sent=${sent} failed=${failed} retried=${retried}`);
    return { claimed: claimed.length, sent, failed, retried };
  }

  // ------------------------------------------------------------------
  // Attachments
  // ------------------------------------------------------------------

  async uploadAttachment(args: {
    userId: string;
    isSuperAdmin: boolean;
    orgId: string;
    fileName: string;
    dataBase64: string;
  }): Promise<BroadcastAttachmentDto> {
    await this.assertReachesOrg(args.userId, args.isSuperAdmin, args.orgId);
    const bytes = Buffer.from(args.dataBase64, "base64");
    if (bytes.length === 0) throw new BadRequestException("The file is empty.");
    if (bytes.length > 3 * 1024 * 1024) throw new BadRequestException("Attachments can be up to 3 MB.");
    const contentType = detectComplianceFileType(bytes);
    if (!contentType) throw new BadRequestException("Attach a PDF, PNG, JPEG or WebP file.");
    const fileName = args.fileName.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200) || "attachment";
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let stored: { bucket: string; path: string };
    try {
      stored = await this.storage.uploadBroadcastAttachment({
        orgId: args.orgId,
        contentType,
        extension: complianceFileExtension(contentType),
        bytes
      });
    } catch (err) {
      this.log.error(`broadcast attachment store failed org=${args.orgId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException("We could not store the file. This is a problem on our side. Try again in a few minutes.");
    }
    const ba = schema.broadcastAttachments;
    const [row] = await this.db
      .insert(ba)
      .values({
        orgId: args.orgId,
        uploadedByUserId: args.userId,
        storageBucket: stored.bucket,
        storagePath: stored.path,
        fileName,
        contentType,
        sizeBytes: bytes.length,
        sha256
      })
      .returning();
    if (!row) throw new Error("attachment row not written");
    this.log.log(`broadcast attachment id=${row.id} org=${args.orgId} bytes=${bytes.length} type=${contentType} by=${args.userId}`);
    return toAttachmentDto(row);
  }

  /** Remove an attachment that is not part of a sent or scheduled announcement. */
  async removeAttachment(userId: string, isSuperAdmin: boolean, id: string): Promise<{ id: string; deleted: boolean }> {
    const ba = schema.broadcastAttachments;
    const [row] = await this.db.select().from(ba).where(eq(ba.id, id)).limit(1);
    if (!row) throw new NotFoundException("Attachment not found");
    await this.assertReachesOrg(userId, isSuperAdmin, row.orgId);
    if (row.broadcastKey) throw new ConflictException("This file is part of an announcement already sent or scheduled.");
    const deleted = await this.db
      .delete(ba)
      .where(and(eq(ba.id, id), isNull(ba.broadcastKey)))
      .returning({ id: ba.id });
    if (deleted.length) {
      await this.storage.removeComplianceDocument(row.storageBucket, row.storagePath).catch((err) =>
        this.log.error(`orphan attachment file ${row.storagePath}: ${(err as Error).message}`)
      );
    }
    return { id, deleted: deleted.length > 0 };
  }

  /**
   * Open an attachment from a signed link (email or in-app). The link is
   * `?e=<expiry unix>&s=<hmac(id:e)>`; a valid one gets a 5-minute signed
   * storage URL. Unknown id, bad signature and expired link all answer 404.
   */
  async openSignedAttachment(id: string, e: string, s: string): Promise<string> {
    const expires = Number(e);
    if (!Number.isFinite(expires) || expires * 1000 < Date.now() || !this.verifyLink(id, expires, s)) {
      throw new NotFoundException("This link has expired or is not valid.");
    }
    const ba = schema.broadcastAttachments;
    const [row] = await this.db.select().from(ba).where(eq(ba.id, id)).limit(1);
    if (!row || !row.broadcastKey) throw new NotFoundException("This link has expired or is not valid.");
    const url = await this.storage.signComplianceDocumentUrl(row.storageBucket, row.storagePath, SIGNED_URL_TTL_SECONDS);
    this.log.log(`broadcast attachment opened id=${id} org=${row.orgId}`);
    return url;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /**
   * Attach uploaded files to this announcement. Each must be in the org
   * and free (or already bound to this same key, for a replay).
   */
  private async bindAttachments(orgId: string, ids: string[], key: string | null): Promise<Array<typeof schema.broadcastAttachments.$inferSelect>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return [];
    if (unique.length > MAX_ATTACHMENTS) throw new BadRequestException(`Attach up to ${MAX_ATTACHMENTS} files.`);
    if (!key) throw new BadRequestException("Attachments need the composer's idempotency key.");
    const ba = schema.broadcastAttachments;
    const rows = await this.db.select().from(ba).where(and(inArray(ba.id, unique), eq(ba.orgId, orgId)));
    if (rows.length !== unique.length) throw new NotFoundException("Attachment not found");
    if (rows.some((r) => r.broadcastKey && r.broadcastKey !== key)) {
      throw new ConflictException("A file is already part of another announcement. Upload it again.");
    }
    const bound = await this.db
      .update(ba)
      .set({ broadcastKey: key })
      .where(and(inArray(ba.id, unique), or(isNull(ba.broadcastKey), eq(ba.broadcastKey, key))))
      .returning();
    if (bound.length !== unique.length) throw new ConflictException("A file changed while sending. Try again.");
    return bound;
  }

  private async attachmentsForKey(key: string) {
    const ba = schema.broadcastAttachments;
    return this.db.select().from(ba).where(eq(ba.broadcastKey, key)).orderBy(asc(ba.createdAt));
  }

  private async deliver(
    req: BroadcastRequest,
    key: string | undefined,
    attachments: Array<typeof schema.broadcastAttachments.$inferSelect>,
    publicBase: string,
    resume: boolean
  ): Promise<AnnouncementResult & { attachments: number }> {
    const expires = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
    const links = attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      url: `${publicBase}/public/broadcast-attachments/${a.id}?e=${expires}&s=${this.signLink(a.id, expires)}`
    }));
    const body = links.length
      ? `${req.body}\n\nAttachments (links work for 90 days):\n${links.map((l) => `- ${l.fileName}: ${l.url}`).join("\n")}`
      : req.body;
    const result = await sendAnnouncement(this.db, this.notify, this.log, {
      orgId: req.orgId,
      idempotencyKey: key,
      resume,
      channels: req.channels,
      recipients: async () =>
        resolveAnnouncementRecipients(
          this.db,
          await this.targetScope(req.targetType, req.targetId, req.orgId),
          req.orgId,
          req.audiences
        ),
      payload: {
        subject: req.subject,
        body,
        targetType: req.targetType,
        targetId: req.targetId,
        audiences: req.audiences,
        attachments: links.map((l) => ({ id: l.id, fileName: l.fileName }))
      },
      sourceEvent: "org.broadcast",
      describe: `org=${req.orgId} target=${req.targetType}:${req.targetId} audiences=${req.audiences.join(",")} attachments=${links.length}`
    });
    return { ...result, attachments: links.length };
  }

  private linkKey(): string {
    const k = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!k) throw new ServiceUnavailableException("Attachment links are not set up on our side.");
    return createHmac("sha256", k).update("broadcast-attachment-link-v1").digest("hex");
  }

  private signLink(id: string, expires: number): string {
    return createHmac("sha256", this.linkKey()).update(`${id}:${expires}`).digest("base64url");
  }

  private verifyLink(id: string, expires: number, s: string): boolean {
    const want = Buffer.from(this.signLink(id, expires));
    const got = Buffer.from(s ?? "");
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private async getScheduled(id: string): Promise<ScheduledBroadcastDto> {
    const sb = schema.scheduledBroadcasts;
    const [r] = await this.db
      .select({
        row: sb,
        createdByName: schema.profiles.displayName,
        createdByEmail: schema.profiles.email
      })
      .from(sb)
      .leftJoin(schema.profiles, eq(schema.profiles.id, sb.createdByUserId))
      .where(eq(sb.id, id))
      .limit(1);
    if (!r) throw new NotFoundException("Scheduled announcement not found");
    const req = r.row.request as unknown as BroadcastRequest;
    const ba = schema.broadcastAttachments;
    const files = await this.db
      .select({ id: ba.id, fileName: ba.fileName })
      .from(ba)
      .where(eq(ba.broadcastKey, r.row.idempotencyKey))
      .orderBy(desc(ba.createdAt));
    return {
      id: r.row.id,
      orgId: r.row.orgId,
      idempotencyKey: r.row.idempotencyKey,
      sendAt: r.row.sendAt.toISOString(),
      status: r.row.status as ScheduledBroadcastDto["status"],
      subject: req.subject,
      targetType: req.targetType,
      audiences: req.audiences,
      channels: req.channels,
      attachments: files,
      result: (r.row.result as unknown as AnnouncementResult | null) ?? null,
      lastError: r.row.lastError,
      createdByName: r.createdByName ?? r.createdByEmail ?? null,
      createdAt: r.row.createdAt.toISOString(),
      sentAt: r.row.sentAt?.toISOString() ?? null,
      cancelledAt: r.row.cancelledAt?.toISOString() ?? null
    };
  }

  /** Teams, leagues, seasons and divisions that sit under the target. */
  async targetScope(type: OrgTargetType, targetId: string, orgId: string): Promise<AnnouncementTarget> {
    const teamIds = await teamIdsInTarget(this.db, type, targetId, orgId);

    if (type === "org") {
      const leagues = await this.db.select({ id: schema.leagues.id }).from(schema.leagues).where(eq(schema.leagues.orgId, orgId));
      const seasons = await this.db.select({ id: schema.seasons.id }).from(schema.seasons).where(eq(schema.seasons.orgId, orgId));
      const divisions = seasons.length
        ? await this.db
            .select({ id: schema.divisions.id })
            .from(schema.divisions)
            .where(inArray(schema.divisions.seasonId, seasons.map((s) => s.id)))
        : [];
      return {
        teamIds,
        leagueIds: leagues.map((l) => l.id),
        seasonIds: seasons.map((s) => s.id),
        divisionIds: divisions.map((d) => d.id)
      };
    }

    // Divisions under the target, with their season and league.
    const where =
      type === "league"
        ? eq(schema.seasons.leagueId, targetId)
        : type === "season"
          ? eq(schema.divisions.seasonId, targetId)
          : type === "division"
            ? eq(schema.divisions.id, targetId)
            : teamIds.length
              ? inArray(
                  schema.divisions.id,
                  this.db
                    .select({ id: schema.divisionTeamEntries.divisionId })
                    .from(schema.divisionTeamEntries)
                    .where(
                      and(
                        inArray(schema.divisionTeamEntries.teamId, teamIds),
                        inArray(schema.divisionTeamEntries.entryStatus, ["applied", "confirmed"])
                      )
                    )
                )
              : sql`false`;
    const rows = await this.db
      .select({
        divisionId: schema.divisions.id,
        seasonId: schema.seasons.id,
        leagueId: schema.seasons.leagueId
      })
      .from(schema.divisions)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(and(where, eq(schema.seasons.orgId, orgId)));

    const leagueIds = new Set(rows.map((r) => r.leagueId));
    const seasonIds = new Set(rows.map((r) => r.seasonId));
    if (type === "league") {
      leagueIds.add(targetId);
      const seasons = await this.db.select({ id: schema.seasons.id }).from(schema.seasons).where(eq(schema.seasons.leagueId, targetId));
      for (const x of seasons) seasonIds.add(x.id);
    }
    if (type === "season") {
      seasonIds.add(targetId);
      const [s] = await this.db
        .select({ leagueId: schema.seasons.leagueId })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, targetId))
        .limit(1);
      if (s) leagueIds.add(s.leagueId);
    }
    return {
      teamIds,
      leagueIds: [...leagueIds],
      seasonIds: [...seasonIds],
      divisionIds: rows.map((r) => r.divisionId)
    };
  }
}

function toAttachmentDto(r: typeof schema.broadcastAttachments.$inferSelect): BroadcastAttachmentDto {
  return {
    id: r.id,
    orgId: r.orgId,
    fileName: r.fileName,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString()
  };
}

/** Public base of this API from a request (`https://host/api`), or API_PUBLIC_URL when set. */
export function apiPublicBase(
  config: ConfigService,
  req: { headers: Record<string, string | string[] | undefined>; protocol?: string }
): string {
  const fixed = config.get<string>("API_PUBLIC_URL")?.trim();
  if (fixed) return fixed.replace(/\/+$/, "");
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim();
  const proto = first(req.headers["x-forwarded-proto"]) || req.protocol || "https";
  const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host) || "localhost";
  return `${proto}://${host}/api`;
}
