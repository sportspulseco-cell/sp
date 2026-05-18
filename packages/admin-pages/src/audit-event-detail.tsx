import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Eyebrow } from "@sportspulse/ui";
import type { AuditEvent } from "@sportspulse/api-client";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

/**
 * Read-only audit event detail. Pure presentational — each app
 * fetches the event via its own `audit.get` SDK binding and passes
 * it in. The AuditController is gated by AuthorizedAccessGuard with
 * org-scope filtering inside the query handler, so org_admin can hit
 * `/audit/:id` directly (no proxy needed).
 */
export function AuditEventDetail({
  event,
  backHref
}: {
  event: AuditEvent;
  /** Default `/audit`. */
  backHref?: string;
}) {
  return (
    <div className="space-y-8">
      <Link
        href={backHref ?? "/audit"}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All audit events
      </Link>

      <header className="space-y-2 border-b border-border pb-6">
        <Eyebrow>AUDIT · {event.id.slice(0, 8)}</Eyebrow>
        <h1 className="font-mono text-[28px] font-semibold tracking-tight text-fg">
          {event.action}
        </h1>
        <p className="text-[13px] text-fg-muted">
          on{" "}
          <span className="font-mono uppercase tracking-wide">
            {event.resourceType}
          </span>
          {event.resourceId ? (
            <span className="ml-1 font-mono">· {event.resourceId}</span>
          ) : null}
          <span className="ml-2 text-fg-muted">at {fmt(event.tsUtc)}</span>
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DetailRow label="Actor user" value={event.actorUserId} />
        <DetailRow label="On behalf of" value={event.onBehalfOfUserId} />
        <DetailRow label="Org" value={event.orgId} />
        <DetailRow label="Request id" value={event.requestId} />
        <DetailRow label="IP" value={event.ipAddr} />
        <DetailRow label="User agent" value={event.userAgent} truncate />
        <DetailRow label="Retention class" value={event.retentionClass} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <DiffPanel title="Before" payload={event.before} />
        <DiffPanel title="After" payload={event.after} />
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  truncate
}: {
  label: string;
  value: string | null;
  truncate?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p
        className={
          "mt-1 font-mono text-[12px] text-fg " +
          (truncate ? "truncate" : "break-all")
        }
      >
        {value ?? <span className="text-fg-muted">—</span>}
      </p>
    </div>
  );
}

function DiffPanel({
  title,
  payload
}: {
  title: string;
  payload: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="border-b border-border px-5 py-3">
        <Eyebrow>{title}</Eyebrow>
      </header>
      <pre className="max-h-[480px] overflow-auto p-5 font-mono text-[11px] leading-relaxed text-fg scrollbar-thin">
        {payload ? JSON.stringify(payload, null, 2) : "—"}
      </pre>
    </div>
  );
}
