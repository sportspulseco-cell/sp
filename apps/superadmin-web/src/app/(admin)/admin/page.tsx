import {
  Activity,
  Database,
  Flag,
  Settings2,
  Sparkles,
  Trophy
} from "lucide-react";
import Link from "next/link";
import { admin } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { ToggleFlagButton } from "@/components/admin/toggle-flag-button";
import { ToggleSportButton } from "@/components/admin/toggle-sport-button";
import { UpsertSettingButton } from "@/components/admin/upsert-setting-button";
import { UpsertFlagButton } from "@/components/admin/upsert-flag-button";

export const metadata = { title: "Admin Console — SportsPulse" };

type Tab = "settings" | "flags" | "sports" | "health";

const TABS: Array<{ key: Tab; label: string; mono: string }> = [
  { key: "health", label: "Health", mono: "HEALTH" },
  { key: "settings", label: "Settings", mono: "SETTINGS" },
  { key: "flags", label: "Feature flags", mono: "FLAGS" },
  { key: "sports", label: "Sports", mono: "SPORTS" }
];

function fmtAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: Tab }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp?.tab ?? "health";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="PLATFORM"
        title="Admin Console"
        description="System-wide settings, feature flags, sport configuration, and platform health. Restricted to super-admin."
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin?tab=${t.key}`}
              className={
                active
                  ? "relative border-b-2 border-fg px-3 pb-2.5 text-sm font-medium text-fg"
                  : "border-b-2 border-transparent px-3 pb-2.5 text-sm font-medium text-fg-muted hover:text-fg"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "health" ? <HealthTab /> : null}
      {tab === "settings" ? <SettingsTab /> : null}
      {tab === "flags" ? <FlagsTab /> : null}
      {tab === "sports" ? <SportsTab /> : null}
    </div>
  );
}

// ---------- Health ----------

async function HealthTab() {
  const health = await admin.health().catch(() => null);

  if (!health) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6">
        <Eyebrow>STATUS</Eyebrow>
        <p className="mt-2 text-base font-semibold text-rose-600 dark:text-rose-400">
          API unreachable
        </p>
      </div>
    );
  }

  const tint: Tint = health.status === "ok" ? "emerald" : "rose";

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Status</Eyebrow>
            <IconTile icon={Activity} tint={tint} size="sm" />
          </div>
          <p
            className={
              "mt-5 text-[28px] font-semibold tracking-tight " +
              (health.status === "ok"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400")
            }
          >
            {health.status === "ok" ? "All systems normal" : "Degraded"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            checked {fmtAgo(health.timestamp)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Database</Eyebrow>
            <IconTile
              icon={Database}
              tint={health.dbOk ? "emerald" : "rose"}
              size="sm"
            />
          </div>
          <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
            {health.dbLatencyMs}ms
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            select 1 round-trip
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Modules loaded</Eyebrow>
            <IconTile icon={Sparkles} tint="violet" size="sm" />
          </div>
          <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
            {health.modules.length}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            domain modules
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <header className="border-b border-border px-6 py-4">
          <Eyebrow>Domain modules</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Bounded contexts currently loaded by the API runtime.
          </p>
        </header>
        <ul className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {health.modules.map((m) => (
            <li
              key={m}
              className="bg-surface-1 px-6 py-3 font-mono text-[12px] text-fg"
            >
              <span
                aria-hidden
                className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-emerald-500"
              />
              {m}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- Settings ----------

async function SettingsTab() {
  const settings = await admin.listSettings().catch(() => []);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <Eyebrow>System settings</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Platform-wide key/value pairs. {settings.length} on file.
          </p>
        </div>
        <UpsertSettingButton />
      </header>
      {settings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
          <Settings2
            className="mx-auto h-5 w-5 text-fg-muted"
            strokeWidth={1.5}
          />
          <p className="mt-3 text-sm font-semibold text-fg">No settings yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Use the button above to add your first setting (support email,
            default timezone, etc.).
          </p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Key</TH>
              <TH>Category</TH>
              <TH>Value</TH>
              <TH>Updated</TH>
            </TR>
          </THead>
          <TBody>
            {settings.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-[12px] font-medium text-fg">
                  {s.key}
                  {!s.isEditable ? (
                    <Badge tone="warning" mono className="ml-2">
                      LOCKED
                    </Badge>
                  ) : null}
                </TD>
                <TD>
                  <Badge mono>{s.category}</Badge>
                </TD>
                <TD className="max-w-md truncate font-mono text-[11px] text-fg">
                  {JSON.stringify(s.value)}
                </TD>
                <TD className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  {fmtAgo(s.updatedAt)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ---------- Flags ----------

async function FlagsTab() {
  const flags = await admin.listFlags().catch(() => []);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <Eyebrow>Feature flags</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Boolean / variant gates with org allowlist + rollout %.{" "}
            {flags.length} flag{flags.length === 1 ? "" : "s"}.
          </p>
        </div>
        <UpsertFlagButton />
      </header>
      {flags.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
          <Flag className="mx-auto h-5 w-5 text-fg-muted" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-semibold text-fg">No flags yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Use the button above to add your first feature flag.
          </p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Key</TH>
              <TH>Description</TH>
              <TH className="text-center">Rollout</TH>
              <TH>Allowlist</TH>
              <TH>State</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {flags.map((f) => (
              <TR key={f.id}>
                <TD className="font-mono text-[12px] font-medium text-fg">
                  {f.key}
                </TD>
                <TD className="text-fg-muted">
                  {f.description ?? <span className="text-fg-muted">—</span>}
                </TD>
                <TD className="text-center font-mono tabular-nums text-fg">
                  {f.rolloutPct.toFixed(0)}%
                </TD>
                <TD className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  {f.orgAllowlist.length === 0
                    ? "all orgs"
                    : `${f.orgAllowlist.length} org(s)`}
                </TD>
                <TD>
                  <Badge tone={f.isEnabled ? "success" : "neutral"} mono>
                    {f.isEnabled ? "ON" : "OFF"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <ToggleFlagButton flag={f} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ---------- Sports ----------

async function SportsTab() {
  const sports = await admin.listSports().catch(() => []);

  return (
    <section className="space-y-4">
      <header>
        <Eyebrow>Sports catalog</Eyebrow>
        <p className="mt-1 text-[13px] text-fg-muted">
          Sport codes drive stat reducers and game-event types. Toggle
          activation to gate which sports are usable on the platform.
        </p>
      </header>
      <Table>
        <THead>
          <TR>
            <TH>Code</TH>
            <TH>Name</TH>
            <TH>Period</TH>
            <TH className="text-center">Team size</TH>
            <TH>Status</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {sports.map((s) => (
            <TR key={s.code}>
              <TD className="font-mono text-[12px] font-medium text-fg">
                <Trophy
                  className="mr-1.5 inline h-3.5 w-3.5 text-fg-muted"
                  strokeWidth={1.75}
                />
                {s.code}
              </TD>
              <TD className="text-fg">{s.name}</TD>
              <TD className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                {s.periodModel}
              </TD>
              <TD className="text-center font-mono tabular-nums text-fg-muted">
                {s.teamSizeDefault ?? "—"}
              </TD>
              <TD>
                <Badge tone={s.active ? "success" : "neutral"} mono>
                  {s.active ? "ACTIVE" : "DISABLED"}
                </Badge>
              </TD>
              <TD className="text-right">
                <ToggleSportButton sport={s} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}
