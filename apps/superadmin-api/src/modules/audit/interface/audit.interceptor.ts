import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { Observable, from, switchMap } from "rxjs";
import { AuditWriterService } from "../application/audit-writer.service";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Records an audit event after every successful (2xx) mutating HTTP request.
 *
 * Intentionally coarse — it pulls the resourceType from the URL's first
 * path segment after `/api`, the resourceId from the response body's `id`
 * field (or the URL `:id` param), and stores the request body as `after`.
 * Per-handler emitters can layer richer before/after on top later.
 *
 * BUG-013 — the previous implementation used `tap` with
 * `void this.writer.write(...)`, which is fire-and-forget. On Vercel
 * the serverless function terminates as soon as the response is sent,
 * killing the pending audit insert before it lands. Now uses
 * `switchMap` that AWAITS the write so the function lifetime is held
 * open until the row commits. ~50ms cost per mutation, in exchange
 * for not silently losing audit events.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly writer: AuditWriterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method ?? "").toUpperCase();
    if (READ_METHODS.has(method)) return next.handle();

    return next.handle().pipe(
      switchMap((response) =>
        from(this.writeFromRequest(req, response)).pipe(
          // Always emit the original response — audit writer already
          // swallows its own errors internally so it never blocks the
          // user-facing write.
          switchMap(() => Promise.resolve(response))
        )
      )
    );
  }

  private async writeFromRequest(
    req: {
      url?: string;
      routerPath?: string;
      method?: string;
      params?: Record<string, string>;
      principal?: { userId?: string };
      ip?: string;
      headers?: Record<string, string | undefined>;
    },
    response: unknown
  ): Promise<void> {
    const method = (req.method ?? "").toUpperCase();
    const path: string = req.url ?? req.routerPath ?? "";
    const cleanPath = (path.split("?")[0] ?? path)
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean);
    const afterApi = cleanPath[0] === "api" ? cleanPath.slice(1) : cleanPath;
    const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

    // Walk the path right-to-left to recover (resourceType, verb).
    let resourceType = "unknown";
    let verb: string | null = null;
    const last = afterApi[afterApi.length - 1] ?? "";
    const prev = afterApi[afterApi.length - 2] ?? "";
    if (isUuid(last)) {
      resourceType = prev || last;
      verb =
        method === "PATCH" || method === "PUT" ? "update" : method.toLowerCase();
    } else if (isUuid(prev)) {
      // /<resource>/<id>/<verb>
      resourceType = afterApi[afterApi.length - 3] ?? last;
      verb = last;
    } else {
      // /<scope>/<resource>  (POST = create on collection)
      resourceType = last;
      verb = method === "POST" ? "create" : method.toLowerCase();
    }

    const resourceId =
      req.params?.id ??
      (typeof response === "object" && response !== null
        ? (response as { id?: string }).id
        : null) ??
      null;
    const action = `${resourceType}.${verb}`;

    const principal = req.principal;
    const after =
      response && typeof response === "object" ? response : null;

    // Pull orgId off the response when the DTO carries it (most
    // domain DTOs do: leagues, seasons, divisions, teams, invoices…).
    // Without this, the org-admin audit list — which filters by
    // orgId — hides every mutation the user just performed.
    const orgIdFromResponse =
      after && typeof (after as { orgId?: unknown }).orgId === "string"
        ? ((after as { orgId: string }).orgId)
        : null;

    await this.writer.write({
      actorUserId: principal?.userId ?? null,
      orgId: orgIdFromResponse,
      action,
      resourceType,
      resourceId,
      before: null,
      after: after as Record<string, unknown> | null,
      ipAddr: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null,
      requestId: req.headers?.["x-request-id"] ?? null
    });
  }
}
