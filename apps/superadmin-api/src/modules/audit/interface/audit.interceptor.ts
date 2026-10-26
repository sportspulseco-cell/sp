import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import { Observable, from, switchMap } from "rxjs";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { AuditWriterService } from "../application/audit-writer.service";
import { resolveAuditOrg, snapshotRow } from "../application/audit-targets";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuditTarget {
  resourceType: string;
  verb: string;
  /** The record id named in the URL, when there is one. */
  pathId: string | null;
  /** Every (segment, id) pair in the URL, nearest the end first. */
  candidates: Array<{ resourceType: string; id: string }>;
}

type Req = {
  url?: string;
  routerPath?: string;
  method?: string;
  params?: Record<string, string>;
  principal?: { userId?: string };
  ip?: string;
  headers?: Record<string, string | undefined>;
};

/** Path endings that name an action on the record before them. */
const ACTION_VERBS = new Set([
  "accept", "decline", "apply", "approve", "reject", "confirm", "cancel", "withdraw", "redeem",
  "publish", "publish-schedule", "remind", "sign", "cover", "register", "invite", "bulk",
  "issue-credit", "transfer", "retry-failed", "flush", "subscribe", "unsubscribe", "start",
  "finalize", "score", "postpone", "forfeit", "assign", "revoke", "resend", "decide", "due"
]);

/** Recover (resourceType, verb, record id) from the URL, right to left. */
export function auditTargetFromPath(method: string, path: string): AuditTarget {
  const parts = (path.split("?")[0] ?? path).replace(/^\/+/, "").split("/").filter(Boolean);
  const seg = parts[0] === "api" ? parts.slice(1) : parts;
  const last = seg[seg.length - 1] ?? "";
  const prev = seg[seg.length - 2] ?? "";
  let resourceType = "unknown";
  let verb: string;
  let pathId: string | null = null;
  if (UUID.test(last)) {
    resourceType = prev || last;
    verb = method === "PATCH" || method === "PUT" ? "update" : method.toLowerCase();
    pathId = last;
  } else if (UUID.test(prev)) {
    // /<resource>/<id>/<verb>
    resourceType = seg[seg.length - 3] ?? last;
    verb = last;
    pathId = prev;
  } else if (ACTION_VERBS.has(last) && prev) {
    // /<resource>/<token>/<verb> or /<resource>/<verb>: the verb is the
    // action, not the resource (an invite's token is not a UUID, so the
    // branch above misses it; "accept.create" was recorded 77 times).
    const tokenLike = (v: string) => v.length >= 16 && /\d/.test(v) && /[a-z]/i.test(v) && !v.includes("-");
    resourceType = tokenLike(prev) ? (seg[seg.length - 3] ?? prev) : prev;
    verb = last;
  } else {
    // /<scope>/<resource>  (POST = create on collection)
    resourceType = last;
    verb = method === "POST" ? "create" : method.toLowerCase();
  }
  const candidates: AuditTarget["candidates"] = [];
  for (let i = seg.length - 1; i > 0; i--) {
    if (UUID.test(seg[i]!) && !UUID.test(seg[i - 1]!)) candidates.push({ resourceType: seg[i - 1]!, id: seg[i]! });
  }
  return { resourceType, verb, pathId, candidates };
}

/**
 * Records an audit event after every successful (2xx) mutating HTTP request.
 *
 * - resource_type / action come from the URL; resource_id is the record
 *   id in the URL, else the response's `id`.
 * - before: when the URL names a record (update, delete, /:id/<verb>),
 *   the row is read before the handler runs. Only resource types listed
 *   in audit-targets.ts can be read; others keep before = null.
 * - after: the response body.
 * - org_id: the response's `orgId`, else the organisation of the record
 *   (or of the nearest parent record) in the URL, so the org-admin
 *   activity log sees the event.
 *
 * BUG-013 — the write is AWAITED (switchMap) so a serverless function
 * does not end before the row lands. Audit failures never fail the
 * request: the writer and the lookups here swallow and log their errors.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly log = new Logger("AuditInterceptor");

  constructor(
    private readonly writer: AuditWriterService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Req>();
    const method: string = (req.method ?? "").toUpperCase();
    if (READ_METHODS.has(method)) return next.handle();

    const target = auditTargetFromPath(method, req.url ?? req.routerPath ?? "");
    return from(this.before(target)).pipe(
      switchMap((before) =>
        next.handle().pipe(
          switchMap((response) =>
            from(this.writeFromRequest(req, target, before, response)).pipe(
              switchMap(() => Promise.resolve(response))
            )
          )
        )
      )
    );
  }

  private async before(target: AuditTarget): Promise<Record<string, unknown> | null> {
    if (!target.pathId) return null;
    try {
      return await snapshotRow(this.db, target.resourceType, target.pathId);
    } catch (err) {
      this.log.warn(`before snapshot failed for ${target.resourceType} ${target.pathId}: ${(err as Error).message}`);
      return null;
    }
  }

  private async writeFromRequest(
    req: Req,
    target: AuditTarget,
    before: Record<string, unknown> | null,
    response: unknown
  ): Promise<void> {
    const after = response && typeof response === "object" ? (response as Record<string, unknown>) : null;
    const responseId = after && typeof after.id === "string" && UUID.test(after.id) ? after.id : null;
    const resourceId = target.pathId ?? (req.params?.id && UUID.test(req.params.id) ? req.params.id : null) ?? responseId;

    let orgId = after && typeof after.orgId === "string" ? after.orgId : null;
    if (!orgId && before && typeof before.org_id === "string") orgId = before.org_id;
    if (!orgId) {
      // A created record is found by its new id; otherwise walk the URL.
      const candidates = [...target.candidates];
      if (!target.pathId && responseId) candidates.unshift({ resourceType: target.resourceType, id: responseId });
      try {
        orgId = await resolveAuditOrg(this.db, candidates);
      } catch (err) {
        this.log.warn(`org lookup failed for ${target.resourceType}.${target.verb}: ${(err as Error).message}`);
      }
    }

    await this.writer.write({
      actorUserId: req.principal?.userId ?? null,
      orgId,
      action: `${target.resourceType}.${target.verb}`,
      resourceType: target.resourceType,
      resourceId,
      before,
      after,
      ipAddr: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null,
      requestId: req.headers?.["x-request-id"] ?? null
    });
  }
}
