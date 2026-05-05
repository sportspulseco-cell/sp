"use client";

import type { Season } from "@/lib/api/types";

export function SeasonDetailsTab({ season }: { season: Season }) {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
          // 01 · Season Setup
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
          Season details
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Set the registration window, registration type, and core details.
          All fields auto-save as you tab away.
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border border-border bg-surface-1 p-6 sm:grid-cols-2">
        <Field label="Season name" value={season.name} />
        <Field label="Sport" value={season.sportCode} />
        <Field label="Start date" value={season.startDate} />
        <Field label="End date" value={season.endDate} />
        <Field
          label="Registration opens"
          value={season.registrationOpensAt ?? "—"}
        />
        <Field
          label="Registration closes"
          value={season.registrationClosesAt ?? "—"}
        />
        <Field label="Roster lock" value={season.rosterLockAt ?? "—"} />
        <Field label="Status" value={season.status} />
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Wave 1 — read-only
        </p>
        <p className="mt-2 text-[13px] text-fg-muted">
          Wave 1 surfaces the data. Inline edit + auto-save lands in Wave 2
          (this tab will gain text inputs, date pickers, registration_type
          dropdown, and the rollover panel).
        </p>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className="mt-1.5 text-[14px] font-medium tracking-tight text-fg">
        {value || "—"}
      </p>
    </div>
  );
}
