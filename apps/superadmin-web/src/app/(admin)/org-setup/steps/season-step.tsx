"use client";

import type { SeasonDraft } from "../types";
import { PhaseHeader, SectionHeader } from "./org-step";
import { Field, FieldStyle } from "./league-step";

function fmt(d: string): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Phase 2 — Season identity. Season fields are required; the read-only
 * "season window" summary at the bottom mirrors the dates in plain
 * English so admins can sanity-check the chronology before advancing.
 */
export function SeasonStep({
  draft,
  leagueName,
  onChange
}: {
  draft: SeasonDraft;
  leagueName: string;
  onChange: (patch: Partial<SeasonDraft>) => void;
}) {
  return (
    <div className="space-y-6">
      <PhaseHeader
        index={2}
        title="Create season"
        description="Season-level configuration — repeats each season via rollover"
        tableTag="seasons table"
      />

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <SectionHeader title="Season identity" required />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Season name"
            schemaTag="seasons.name"
            required
            hint="Shown in all dashboards, emails, and registration links. Typically includes the region and year/period."
          >
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value.slice(0, 120) })}
              maxLength={120}
              placeholder="e.g. NH Fall 2025"
              className="input"
              required
            />
          </Field>

          <Field
            label="League ID"
            schemaTag="seasons.leagueId"
            hint="Auto-populated from Phase 1. This season belongs to this league and cannot be moved."
          >
            <input
              type="text"
              value={leagueName || "—"}
              readOnly
              disabled
              className="input cursor-not-allowed bg-bg-subtle text-fg-muted"
            />
          </Field>

          <Field
            label="Season ID"
            schemaTag="seasons.id (UUID)"
            hint="System-generated UUID. Used in all API calls and as the foreign key for divisions, registrations, and games."
          >
            <input
              type="text"
              value="Auto-generated on save"
              readOnly
              disabled
              className="input cursor-not-allowed bg-bg-subtle text-fg-muted font-mono"
            />
          </Field>

          <Field
            label="Season start date"
            schemaTag="seasons.startDate"
            required
            hint="First day of the playing season. Games cannot be scheduled before this date."
          >
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="input"
              required
            />
          </Field>

          <Field
            label="Season end date"
            schemaTag="seasons.endDate"
            required
            hint="Last day of the playing season including playoffs. Must be after start date."
          >
            <input
              type="date"
              value={draft.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              min={draft.startDate || undefined}
              className="input"
              required
            />
          </Field>

          <Field
            label="Registration opens"
            schemaTag="seasons.registrationOpensAt"
            required
            hint="When the public registration link becomes active. Before this date the link shows a countdown."
          >
            <input
              type="date"
              value={draft.registrationOpensAt}
              onChange={(e) => onChange({ registrationOpensAt: e.target.value })}
              className="input"
              required
            />
          </Field>

          <Field
            label="Registration closes"
            schemaTag="seasons.registrationClosesAt"
            required
            hint="After this date, registration is closed. The public link shows a closed message."
          >
            <input
              type="date"
              value={draft.registrationClosesAt}
              onChange={(e) =>
                onChange({ registrationClosesAt: e.target.value })
              }
              min={draft.registrationOpensAt || undefined}
              className="input"
              required
            />
          </Field>

          <Field
            label="Roster lock date"
            schemaTag="seasons.rosterLockAt"
            hint="After this date no players can be added or removed from any team roster in this season. Leave blank for no lock."
          >
            <input
              type="date"
              value={draft.rosterLockAt}
              onChange={(e) => onChange({ rosterLockAt: e.target.value })}
              className="input"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-6">
        <SectionHeader
          title="Season window"
          hint="Defines the full registration window visible to players"
          required
        />
        <dl className="space-y-2">
          <SummaryRow
            label="Registration window"
            value={`${fmt(draft.registrationOpensAt)} → ${fmt(draft.registrationClosesAt)}`}
          />
          <SummaryRow
            label="Playing window"
            value={`${fmt(draft.startDate)} → ${fmt(draft.endDate)}`}
          />
          <SummaryRow
            label="Roster lock"
            value={fmt(draft.rosterLockAt)}
          />
        </dl>
      </section>

      <FieldStyle />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[13px] text-fg">{label}</dt>
      <dd className="font-mono text-[12px] text-fg-muted">{value}</dd>
    </div>
  );
}
