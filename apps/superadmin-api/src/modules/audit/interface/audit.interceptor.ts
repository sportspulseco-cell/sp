import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { AuditWriterService } from "../application/audit-writer.service";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Records an audit event after every successful (2xx) mutating HTTP request.
 *
 * Intentionally coarse — it pulls the resourceType from the URL's first
 * path segment after `/api`, the resourceId from the response body's `id`
 * field (or the URL `:id` param), and stores the request body as `after`.
 * Per-handler emitters can layer richer before/after on top later.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly writer: AuditWriterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method ?? "").toUpperCase();
    if (READ_METHODS.has(method)) return next.handle();

    return next.handle().pipe(
      tap((response) => {
        const path: string = req.url ?? req.routerPath ?? "";
        const cleanPath = (path.split("?")[0] ?? path)
          .replace(/^\/+/, "")
          .split("/")
          .filter(Boolean);
        const afterApi =
          cleanPath[0] === "api" ? cleanPath.slice(1) : cleanPath;
        const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

        // Walk the path right-to-left to recover (resourceType, verb).
        let resourceType = "unknown";
        let verb: string | null = null;
        const last = afterApi[afterApi.length - 1] ?? "";
        const prev = afterApi[afterApi.length - 2] ?? "";
        if (isUuid(last)) {
          resourceType = prev || last;
          verb = method === "PATCH" || method === "PUT" ? "update" : method.toLowerCase();
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

        void this.writer.write({
          actorUserId: principal?.userId ?? null,
          orgId: null,
          action,
          resourceType,
          resourceId,
          before: null,
          after: after as Record<string, unknown> | null,
          ipAddr: (req.ip as string) ?? null,
          userAgent: (req.headers?.["user-agent"] as string) ?? null,
          requestId: (req.headers?.["x-request-id"] as string) ?? null
        });
      })
    );
  }
}
