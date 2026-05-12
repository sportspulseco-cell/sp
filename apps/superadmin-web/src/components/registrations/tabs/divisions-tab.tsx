"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  resolveSeasonConfig,
  type SeasonConfig
} from "@sportspulse/kernel";
import { Field, Input } from "@sportspulse/ui";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Division, Season } from "@/lib/api/types";

/**
 * Divisions & eligibility — Registration Setup Wizard step 3.
 *
 * The mockup has two panels:
 *   1. Per-season toggles (USA Hockey ID, free agent, parental consent,
 *      liability waiver, max roster, roster lock-at) — these drive
 *      the funnel's behaviour at submission time. Backed by
 *      `seasons.config` JSONB; schema in @sportspulse/kernel
 *      SeasonConfig.
 *   2. Division list (read-only here; division CRUD lives on the
 *      `/divisions` page, division-to-tier assignment will land in
 *      the Pricing tab).
 */
export function DivisionsTab({
  divisions,
  season
}: {
  divisions: Division[];
  season: Season;
}) {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
          // 03 · Divisions &amp; eligibility
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
          Divisions &amp; eligibility
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Per-season toggles drive what the registration funnel asks for and
          enforces. Saved values stick on this season only — other seasons
          are unaffected.
        </p>
      </header>

      <SeasonConfigPanel season={season} />

      <DivisionListPanel divisions={divisions} />
    </div>
  );
}

function SeasonConfigPanel({ season }: { season: Season }) {
  // Seed rosterLockAt from the seasons.roster_lock_at column when
  // the JSONB config key is empty — the column is the runtime source
  // of truth (set during season creation), the JSONB key is a mirror
  // that older flows leave behind. <input type="datetime-local">
  // expects "YYYY-MM-DDTHH:mm", so trim the timezone suffix.
  const initial = resolveSeasonConfig(season.config as SeasonConfig | undefined);
  if (!initial.rosterLockAt && season.rosterLockAt) {
    initial.rosterLockAt = toDatetimeLocal(season.rosterLockAt);
  }
  const [config, setConfig] = useState<SeasonConfig>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function patch<K extends keyof SeasonConfig>(
    key: K,
    value: SeasonConfig[K]
  ) {
    const prev = config[key];
    setConfig((c) => ({ ...c, [key]: value }));
    setSaving(key as string);
    setError(null);
    setFlash(null);
    try {
      if (key === "rosterLockAt") {
        // rosterLockAt lives on the seasons.roster_lock_at column —
        // patch the column directly so date queries (roster lock
        // enforcement) see the value. The JSONB mirror is kept in sync
        // by the same call below.
        const iso = value
          ? new Date(value as string).toISOString()
          : null;
        await leagueMgmt.updateSeason(season.id, { rosterLockAt: iso });
        await leagueMgmt.updateSeasonConfig(season.id, {
          rosterLockAt: (value as string) ?? undefined
        } as never);
      } else {
        await leagueMgmt.updateSeasonConfig(season.id, {
          [key]: value
        } as never);
      }
      setFlash(`Saved · ${String(key)}`);
    } catch (e) {
      setConfig((c) => ({ ...c, [key]: prev }));
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  function toDatetimeLocal(iso: string): string {
    // ISO timestamp → "YYYY-MM-DDTHH:mm" in local time (what the
    // datetime-local input renders / emits).
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
      <header>
        <p className="text-[14px] font-semibold text-fg">Eligibility &amp; roster rules</p>
        <p className="text-[12px] text-fg-muted">
          Backed by <span className="font-mono">seasons.config</span>. Each
          toggle saves on change.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Max roster size"
          hint="Hard cap. Captains can't add players past this number."
        >
          <Input
            type="number"
            min={1}
            value={config.maxRosterSize ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setConfig((c) => ({
                ...c,
                maxRosterSize: v ? Number(v) : undefined
              }));
            }}
            onBlur={() => patch("maxRosterSize", config.maxRosterSize)}
          />
        </Field>
        <Field
          label="Roster lock at"
          hint="After this, roster moves are blocked."
        >
          <Input
            type="datetime-local"
            value={config.rosterLockAt ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setConfig((c) => ({ ...c, rosterLockAt: v || undefined }));
            }}
            onBlur={() => patch("rosterLockAt", config.rosterLockAt)}
          />
        </Field>
      </div>

      <ToggleRow
        label="Require USA Hockey ID"
        hint="Players must submit a valid governing-body ID + future expiry."
        checked={!!config.requireUsaHockeyId}
        loading={saving === "requireUsaHockeyId"}
        onChange={(v) => patch("requireUsaHockeyId", v)}
      />
      <ToggleRow
        label="Require liability waiver"
        hint="Hard block — registration cannot complete without a typed signature."
        checked={!!config.requireLiabilityWaiver}
        loading={saving === "requireLiabilityWaiver"}
        onChange={(v) => patch("requireLiabilityWaiver", v)}
      />
      <ToggleRow
        label="Allow free agent registration"
        hint="Adds the free-agent path on the funnel's landing screen."
        checked={!!config.allowFreeAgent}
        loading={saving === "allowFreeAgent"}
        onChange={(v) => patch("allowFreeAgent", v)}
      />
      <ToggleRow
        label="Parental consent for minors"
        hint="Auto-triggered if DOB indicates age under 18."
        checked={!!config.parentalConsentRequired}
        loading={saving === "parentalConsentRequired"}
        onChange={(v) => patch("parentalConsentRequired", v)}
      />

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {flash && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  loading,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  loading: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-bg-subtle px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        <span className="block text-[11px] text-fg-muted">{hint}</span>
      </span>
      <span className="flex items-center gap-2">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-muted" />}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
      </span>
    </label>
  );
}

function DivisionListPanel({ divisions }: { divisions: Division[] }) {
  return (
    <section className="space-y-3">
      <header>
        <p className="text-[14px] font-semibold text-fg">Divisions in this season</p>
        <p className="text-[12px] text-fg-muted">
          Manage division CRUD on the main <span className="font-mono">/divisions</span>{" "}
          page. Tier assignment lands in the Pricing step.
        </p>
      </header>

      {divisions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center">
          <p className="text-[14px] text-fg-muted">
            No divisions configured for this season yet.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {divisions.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between border-b border-border px-5 py-3 last:border-b-0"
            >
              <div>
                <p className="text-[14px] font-medium tracking-tight text-fg">
                  {d.name}
                </p>
                <p className="font-mono text-[11px] text-fg-muted">
                  {d.tier ?? "—"} · {d.genderEligibility} · {d.status}
                </p>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                {d.id.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
