import { Gavel, ShieldCheck, ShieldAlert, ShieldOff, Star } from "lucide-react";
import { load } from "@sportspulse/api-client";
import { formatCalendarDate, statusLabel } from "@sportspulse/kernel";
import { Badge, EmptyState, Eyebrow, LoadError } from "@sportspulse/ui";
import { compliance, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compliance — SportsPulse" };

/**
 * Workflow 7C §6.9 — read-only captain compliance tab.
 *
 * The captain can see USA Hockey + playoff eligibility status per
 * player on their team but cannot modify state. Waiving is admin-only
 * via the admin compliance dashboard. Suspended players are listed
 * with the games or date left (UC-14, COMP-12); lineups refuse them.
 */
export default async function CaptainCompliancePage() {
  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const myTeamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !myTeamId) {
    return (
      <EmptyState
        icon={Star}
        title="Captain role required"
        description="Ask your league admin to assign captain to your account."
      />
    );
  }

  // Team-scoped endpoints: only this team's roster, with names.
  const [recordsResult, suspended] = await Promise.all([
    load(compliance.teamEligibility(myTeamId)),
    load(compliance.teamSuspensions(myTeamId))
  ]);
  const records = recordsResult.ok ? recordsResult.data : { items: [] };
  const suspendedItems = suspended.ok ? suspended.data.items : [];

  const counts = {
    allClear: records.items.filter((r) => r.status === "eligible").length,
    actionNeeded: records.items.filter(
      (r) => r.status === "ineligible" || r.status === "expired"
    ).length,
    expiring: records.items.filter((r) => r.status === "expiring").length,
    waived: records.items.filter((r) => r.status === "waived").length
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Captain console"
        title="Waivers & documents"
        description="Per-player USA Hockey + playoff eligibility. Read-only — admins issue waivers."
      />

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-fg-muted" strokeWidth={1.5} />
            <Eyebrow>suspended players</Eyebrow>
          </div>
          {suspended.ok ? (
            <Badge tone={suspendedItems.length ? "danger" : "success"} mono>
              {suspendedItems.length} suspended
            </Badge>
          ) : null}
        </header>
        {!suspended.ok ? (
          <p role="alert" className="px-5 py-4 text-[13px] text-[var(--tint-rose-fg)]">
            Could not load suspensions ({suspended.status}). Lineups still refuse suspended players when you save.
          </p>
        ) : suspendedItems.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-fg-muted">No player on your roster is suspended.</p>
        ) : (
          <ul className="divide-y divide-border">
            {suspendedItems.map((x) => (
              <li
                key={x.suspensionId}
                className="grid grid-cols-1 gap-1 px-5 py-3 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div>
                  <p className="text-[13px] font-medium text-fg">{x.displayName}</p>
                  {x.reason ? (
                    <p className="mt-0.5 text-[12px] text-fg-muted">{x.reason}</p>
                  ) : null}
                </div>
                <Badge tone="danger" mono>
                  Suspended · {x.label}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          label="All clear"
          count={counts.allClear}
          tone="success"
          Icon={ShieldCheck}
        />
        <SummaryTile
          label="Action needed"
          count={counts.actionNeeded}
          tone="danger"
          Icon={ShieldOff}
        />
        <SummaryTile
          label="Expiring"
          count={counts.expiring}
          tone="warning"
          Icon={ShieldAlert}
        />
        <SummaryTile
          label="Waived"
          count={counts.waived}
          tone="info"
          Icon={ShieldCheck}
        />
      </div>

      {!recordsResult.ok ? (
        <LoadError what="your team's eligibility" status={recordsResult.status} message={recordsResult.message} />
      ) : records.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No compliance records yet"
          description="The admin will run a season sweep to populate per-player status."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>roster compliance</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {records.items.length} records
            </span>
          </header>
          <ul className="divide-y divide-border">
            {records.items.map((r) => {
              const evalBlock =
                (r.ruleEvaluation as Record<string, unknown> | null) ?? {};
              const usah =
                (evalBlock["usaHockeyId"] as
                  | { status?: string; expiresAt?: string | null }
                  | undefined) ?? null;
              const playoff =
                (evalBlock["playoffEligibility"] as
                  | { status?: string }
                  | undefined) ?? null;
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3 md:grid-cols-4 md:items-center"
                >
                  <div className="text-[13px] font-medium text-fg">
                    {r.displayName ?? "Unnamed player"}
                  </div>
                  <div>
                    <Badge status={r.status} domain="compliance" />
                  </div>
                  <div className="text-[12px] text-fg-muted">
                    USA Hockey:{" "}
                    {usah?.status
                      ? `${statusLabel(usah.status)}${usah.expiresAt ? ` · ${formatCalendarDate(usah.expiresAt)}` : ""}`
                      : "—"}
                  </div>
                  <div className="text-[12px] text-fg-muted">
                    Playoff: {playoff?.status ? statusLabel(playoff.status) : "—"}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  count,
  tone,
  Icon
}: {
  label: string;
  count: number;
  tone: "success" | "danger" | "warning" | "info";
  Icon: typeof ShieldCheck;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-fg-muted" strokeWidth={1.5} />
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-semibold tabular-nums text-fg">
          {count}
        </span>
        <Badge tone={tone} mono>
          {tone === "success"
            ? "ok"
            : tone === "warning"
              ? "watch"
              : tone === "danger"
                ? "act"
                : "info"}
        </Badge>
      </div>
    </div>
  );
}

