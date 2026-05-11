import { ShieldCheck, ShieldAlert, ShieldOff, Star } from "lucide-react";
import { Badge, EmptyState, Eyebrow } from "@sportspulse/ui";
import { compliance, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compliance — SportsPulse" };

/**
 * Workflow 7C §6.9 — read-only captain compliance tab.
 *
 * The captain can see USA Hockey + playoff eligibility status per
 * player on their team but cannot modify state. Waiving is admin-only
 * via the admin compliance dashboard.
 */
export default async function CaptainCompliancePage() {
  const scope = await iam.meScope().catch(() => null);
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

  const seasons = await leagueMgmt.listSeasons().catch(() => ({ items: [] }));
  const activeSeasonId =
    seasons.items.find(
      (s) =>
        s.status === "in_progress" ||
        s.status === "playoffs" ||
        s.status === "registration_open"
    )?.id ?? seasons.items[0]?.id ?? null;

  const records = activeSeasonId
    ? await compliance
        .listEligibility({ seasonId: activeSeasonId, limit: 100 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

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
        eyebrow="// Captain console"
        title="Roster compliance"
        description="Per-player USA Hockey + playoff eligibility. Read-only — admins issue waivers."
      />

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

      {records.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No compliance records yet"
          description="The admin will run a season sweep to populate per-player status."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// roster compliance</Eyebrow>
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
                  <div className="font-mono text-[11px] uppercase text-fg-muted">
                    {r.personId.slice(0, 8)}
                  </div>
                  <div>
                    <Badge tone={recordTone(r.status)} mono>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="text-[12px] text-fg-muted">
                    USA Hockey:{" "}
                    {usah?.status
                      ? `${usah.status}${usah.expiresAt ? ` · ${new Date(usah.expiresAt).toLocaleDateString()}` : ""}`
                      : "—"}
                  </div>
                  <div className="text-[12px] text-fg-muted">
                    Playoff: {playoff?.status ?? "—"}
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

function recordTone(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "eligible") return "success";
  if (status === "ineligible" || status === "expired") return "danger";
  if (status === "expiring" || status === "flagged") return "warning";
  if (status === "waived") return "info";
  return "neutral";
}
