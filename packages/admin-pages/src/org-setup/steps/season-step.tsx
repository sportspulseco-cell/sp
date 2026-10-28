"use client";

import type { SeasonDraft } from "../types";
import { SectionHeader } from "./org-step";
import { Field } from "./league-step";
import { Input } from "@sportspulse/ui";

function todayIso(): string {
  // Local-date ISO (YYYY-MM-DD) — matches the format <input type="date"> emits.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Org setup step 3: the season's name and dates, grouped as a season runs. */
export function SeasonStep({
  draft,
  leagueName,
  onChange
}: {
  draft: SeasonDraft;
  leagueName: string;
  onChange: (patch: Partial<SeasonDraft>) => void;
}) {
  const today = todayIso();
  const date = (
    key: "startDate" | "endDate" | "registrationOpensAt" | "registrationClosesAt" | "rosterLockAt" | "playoffStartDate" | "playoffEndDate",
    label: string,
    hint: string,
    opts: { required?: boolean; min?: string; max?: string } = {}
  ) => (
    <Field label={label} required={opts.required} hint={hint}>
      <Input
        type="date"
        value={draft[key]}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<SeasonDraft>)}
        min={opts.min}
        max={opts.max}
        required={opts.required}
      />
    </Field>
  );
  const hasPlayoffs = !!(draft.playoffStartDate || draft.playoffEndDate);
  // Grouped in the order a season happens (doc/design/guided-ui.md:
  // common region, continuity): name, registration, games, playoffs.
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <SectionHeader title="Name" required />
        <Field label="Season name" required hint={leagueName ? `Part of ${leagueName}.` : "For example NH Fall 2026."}>
          <Input
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value.slice(0, 120) })}
            maxLength={120}
            placeholder="e.g. NH Fall 2026"
            required
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <SectionHeader title="Registration" required />
        <div className="grid gap-4 sm:grid-cols-2">
          {date("registrationOpensAt", "Registration opens", "Today or later. Today opens it now.", { required: true, min: today })}
          {date("registrationClosesAt", "Registration closes", "The sign-up link closes after this day.", { required: true, min: draft.registrationOpensAt || today })}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <SectionHeader title="Season" required />
        <div className="grid gap-4 sm:grid-cols-3">
          {date("startDate", "Season start date", "No games before this day.", { required: true, min: today })}
          {date("endDate", "Season end date", "Including playoffs.", { required: true, min: draft.startDate || today })}
          {date("rosterLockAt", "Roster lock date", "Optional. Rosters freeze after this day.", { min: today })}
        </div>
      </section>

      <details open={hasPlayoffs} className="group rounded-xl border border-border bg-surface-1 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
          Playoffs
          <span className="text-[13px] font-normal text-fg-muted group-open:hidden">Optional · add dates</span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {date("playoffStartDate", "Playoff start date", "The regular season ends the day before.", { min: draft.startDate || today, max: draft.endDate || undefined })}
          {date("playoffEndDate", "Playoff end date", "On or before the season end date.", { min: draft.playoffStartDate || draft.startDate || today, max: draft.endDate || undefined })}
        </div>
      </details>
    </div>
  );
}

