
import { Eyebrow, PageHeader, Reveal } from "@sportspulse/ui";
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
      <PageHeader
        eyebrow={`Audit · ${event.id.slice(0, 8)}`}
        title={<span className="font-mono">{event.action}</span>}
        description={
          <p className="text-[13px]">
            on{" "}
            <span className="font-mono uppercase tracking-wide">
              {event.resourceType}
            </span>
            {event.resourceName ? (
              <span className="ml-1">· {event.resourceName}</span>
            ) : event.resourceId ? (
              <span className="ml-1 font-mono">· {event.resourceId}</span>
            ) : null}
            <span className="ml-2">at {fmt(event.tsUtc)}</span>
          </p>
        }
      />

      <Reveal as="section" delay={0.05} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DetailRow label="Actor user" value={event.actorName ?? event.actorUserId} />
        <DetailRow label="On behalf of" value={event.onBehalfOfUserId} />
        <DetailRow label="Org" value={event.orgId} />
        <DetailRow label="Request id" value={event.requestId} />
        <DetailRow label="IP" value={event.ipAddr} />
        <DetailRow label="User agent" value={event.userAgent} truncate />
        <DetailRow label="Retention class" value={event.retentionClass} />
      </Reveal>

      <Reveal as="section" delay={0.1} className="grid gap-6 lg:grid-cols-2">
        <DiffPanel title="Before" payload={event.before} />
        <DiffPanel title="After" payload={event.after} />
      </Reveal>
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
