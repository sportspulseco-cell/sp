"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw,
  Radio, Send, XCircle, ZapOff
} from "lucide-react";
import {
  Badge, Button, EmptyState, TBody, TD, TH, THead, TR, Table
} from "@sportspulse/ui";
import {
  scheduler,
  type ListRinkNotificationsResponse,
  type RinkIntegrationView,
  type RinkOutboxView
} from "./scheduler-client";

interface Props { seasonId: string }

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso ?? "—"; }
}

function circuitTone(
  state: string
): "success" | "warning" | "danger" | "neutral" {
  if (state === "closed") return "success";
  if (state === "half_open") return "warning";
  if (state === "open") return "danger";
  return "neutral";
}

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "delivered") return "success";
  if (s === "pending") return "neutral";
  if (s === "failed") return "warning";
  if (s === "dead_letter") return "danger";
  return "neutral";
}

/**
 * SchedulingRinkNotifications — per-venue notification health + outbox.
 * Pain #2 admin surface: shows which rinks are wired up, their circuit
 * state, and recent delivery attempts with retry status.
 */
export function SchedulingRinkNotifications({ seasonId }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ListRinkNotificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await scheduler.listRinkNotifications({ seasonId, limit: 150 });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [seasonId]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
        Loading rink notifications…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-bg p-5 text-sm">
        <div className="mb-2 flex items-center gap-2 text-fg">
          <XCircle className="h-4 w-4" strokeWidth={1.75} />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Load failed
          </span>
        </div>
        <p className="text-fg-muted">{error}</p>
        <div className="mt-3"><Button onClick={load}>Retry</Button></div>
      </div>
    );
  }

  if (!data) return null;

  const integrationsCount = data.integrations.length;
  const openCircuits = data.integrations.filter(
    (i) => i.circuitState === "open"
  ).length;
  const pendingOutbox = data.outbox.filter((o) => o.status === "pending").length;
  const failedRecent = data.outbox.filter(
    (o) => o.status === "failed" || o.status === "dead_letter"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge tone={openCircuits > 0 ? "warning" : "success"}>
            <Radio className="h-3.5 w-3.5" strokeWidth={1.75} />
            {integrationsCount} integration{integrationsCount === 1 ? "" : "s"}
            {openCircuits > 0 ? ` · ${openCircuits} open` : ""}
          </Badge>
          {pendingOutbox > 0 && (
            <Badge tone="neutral">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
              {pendingOutbox} pending
            </Badge>
          )}
          {failedRecent > 0 && (
            <Badge tone="warning">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
              {failedRecent} failed
            </Badge>
          )}
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
          Refresh
        </Button>
      </div>

      <Section title="Integrations">
        {integrationsCount === 0 ? (
          <EmptyState
            icon={ZapOff}
            title="No rink integrations configured"
            description="No active rink_integrations rows for any venue used by this season. Insert one to start delivering notifications when a schedule publishes."
          />
        ) : (
          <Table>
            <THead><TR>
              <TH>Venue</TH><TH>Kind</TH><TH>Endpoint</TH>
              <TH>Circuit</TH><TH>Last delivery</TH><TH>Last failure</TH>
            </TR></THead>
            <TBody>
              {data.integrations.map((i) => (
                <IntegrationRow key={i.id} integration={i} />
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section title="Recent outbox">
        {data.outbox.length === 0 ? (
          <EmptyState
            icon={Send}
            title="No notifications yet"
            description="Click Publish on a generated schedule and entries land here."
          />
        ) : (
          <Table>
            <THead><TR>
              <TH>When</TH><TH>Venue</TH><TH>Event</TH>
              <TH>Status</TH><TH className="text-right">Attempts</TH>
              <TH>Last error</TH>
            </TR></THead>
            <TBody>
              {data.outbox.map((row) => (
                <OutboxRow key={row.id} row={row} />
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function IntegrationRow({ integration }: { integration: RinkIntegrationView }) {
  return (
    <TR>
      <TD className="font-medium">{integration.venueName}</TD>
      <TD className="text-muted-foreground font-mono text-[10px] uppercase tracking-widest">
        {integration.kind}
      </TD>
      <TD className="text-muted-foreground font-mono text-[11px] truncate max-w-[260px]">
        {integration.endpointUrl
          ? new URL(integration.endpointUrl).host
          : "—"}
      </TD>
      <TD>
        <Badge tone={circuitTone(integration.circuitState)} dot mono>
          {integration.circuitState}
          {integration.failureCount > 0
            ? ` · ${integration.failureCount} fails`
            : ""}
        </Badge>
      </TD>
      <TD className="text-muted-foreground">
        {fmtTs(integration.lastDeliveryAt)}
      </TD>
      <TD className="text-muted-foreground">
        {fmtTs(integration.lastFailureAt)}
      </TD>
    </TR>
  );
}

function OutboxRow({ row }: { row: RinkOutboxView }) {
  return (
    <TR>
      <TD className="font-mono text-[11px] tracking-wide">
        {fmtTs(row.createdAt)}
      </TD>
      <TD className="text-muted-foreground">{row.venueName ?? "—"}</TD>
      <TD className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {row.eventType}
      </TD>
      <TD>
        <Badge tone={statusTone(row.status)}>
          {row.status === "delivered" && (
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {row.status === "dead_letter" && (
            <ZapOff className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {row.status}
        </Badge>
      </TD>
      <TD className="text-right">{row.attemptCount}</TD>
      <TD className="text-muted-foreground text-xs max-w-[280px] truncate">
        {row.lastError ?? ""}
      </TD>
    </TR>
  );
}
