"use client";

import { useMemo } from "react";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import { cn } from "@/lib/utils";
import {
  slugify,
  type LeagueDraft,
  type LeagueFormat,
  type Privacy
} from "../types";
import { PhaseHeader, SectionHeader } from "./org-step";

const FORMATS: { value: LeagueFormat; label: string }[] = [
  { value: "regular", label: "Regular season" },
  { value: "tournament", label: "Tournament" },
  { value: "pickup", label: "Pickup" },
  { value: "friendly", label: "Friendly" }
];

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney"
];

const COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#0EA5E9", // sky
  "#14B8A6"  // teal
];

const PRIVACY_OPTIONS: {
  value: Privacy;
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    label: "Public — visible in league directory",
    description:
      "Anyone can find this league, view standings, and browse team profiles. Registration may still require login."
  },
  {
    value: "unlisted",
    label: "Unlisted — accessible via direct link only",
    description:
      "Does not appear in the directory. Only people with the link can register or view. Useful for private corporate leagues."
  },
  {
    value: "private",
    label: "Private — login required to view anything",
    description:
      "All content including standings and schedules requires an authenticated account with a role in this league. Maximum privacy."
  }
];

export function LeagueStep({
  draft,
  org,
  sports,
  governingBodies,
  onChange
}: {
  draft: LeagueDraft;
  org: Org | null;
  sports: Sport[];
  governingBodies: GoverningBody[];
  onChange: (patch: Partial<LeagueDraft>) => void;
}) {
  const filteredBodies = useMemo(
    () =>
      governingBodies.filter(
        (b) => !draft.sportCode || b.sportCode === draft.sportCode
      ),
    [governingBodies, draft.sportCode]
  );

  return (
    <div className="space-y-6">
      <PhaseHeader
        index={1}
        title="Create league"
        description="League identity — permanent. Seasons and divisions are added after."
        tableTag="leagues table"
      />

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <SectionHeader title="Identity" required />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="League name"
            schemaTag="leagues.name"
            required
            hint="Public-facing name shown on all registration pages, emails, and dashboards. Max 80 chars."
          >
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })}
              maxLength={80}
              placeholder="e.g. New Hampshire AHL"
              className="input"
              required
            />
          </Field>

          <Field
            label="Unique ID (slug)"
            schemaTag="leagues.id → slug"
            required
            hint="URL-safe identifier. Auto-generated from the league name. Used in API paths and registration URLs. Cannot be changed after first season is published."
          >
            <input
              type="text"
              value={draft.slug}
              onChange={(e) => onChange({ slug: slugify(e.target.value) })}
              placeholder="auto-generated"
              className="input font-mono"
              required
            />
          </Field>

          <Field
            label="Sport"
            schemaTag="leagues.sportCode"
            required
            hint="Determines which stat types, period models, and governing bodies are available downstream."
          >
            <select
              value={draft.sportCode}
              onChange={(e) => onChange({ sportCode: e.target.value, governingBodyId: null })}
              className="input"
              required
            >
              {draft.sportCode === "" ? (
                <option value="" disabled>
                  Pick a sport…
                </option>
              ) : null}
              {sports.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name ?? s.code}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Format"
            schemaTag="leagues.format"
            required
            hint="Regular season = scheduled games + standings. Tournament = bracket event. This drives how the scheduler and standings engine behave."
          >
            <select
              value={draft.format}
              onChange={(e) => onChange({ format: e.target.value as LeagueFormat })}
              className="input"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Governing body"
            schemaTag="leagues.governingBodyId"
            hint="Links to the governing_bodies table. Drives ID verification rules and SafeSport requirements for all seasons in this league. Leave blank if your league isn't sanctioned by one."
          >
            <select
              value={draft.governingBodyId ?? ""}
              onChange={(e) =>
                onChange({ governingBodyId: e.target.value || null })
              }
              className="input"
            >
              <option value="">None — unsanctioned</option>
              {filteredBodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Time zone"
            schemaTag="seasons.timezone (inherited)"
            required
            hint="All game times, registration windows, and notification sends are expressed in this time zone. Set it to where the games physically take place."
          >
            <select
              value={draft.timezone}
              onChange={(e) => onChange({ timezone: e.target.value })}
              className="input"
            >
              {TIMEZONES.includes(draft.timezone) ? null : (
                <option value={draft.timezone}>{draft.timezone}</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Organisation ID"
          schemaTag="leagues.orgId"
          hint="Locked to the organisation selected in Phase 0. Cannot be changed after creation."
        >
          <input
            type="text"
            value={org?.displayName ?? org?.legalName ?? ""}
            readOnly
            disabled
            className="input cursor-not-allowed bg-bg-subtle text-fg-muted"
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <SectionHeader title="Branding" optional />
        <div className="grid gap-6 md:grid-cols-2">
          <Field
            label="League logo"
            schemaTag="orgs.branding / metadata"
            hint="Upload a 512×512 PNG or JPG (max 2 MB). Stored on metadata.branding.logoUrl."
          >
            {/* Upload UI is a follow-up — Storage isn't wired yet. The
                input accepts a URL for now so this field still threads
                through to the metadata payload. */}
            <input
              type="url"
              value={draft.branding.logoUrl ?? ""}
              onChange={(e) =>
                onChange({
                  branding: { ...draft.branding, logoUrl: e.target.value || null }
                })
              }
              placeholder="https://… (paste logo URL)"
              className="input"
            />
          </Field>

          <Field
            label="Primary colour"
            schemaTag="orgs.branding"
            hint="Used as accent on registration pages and email templates."
          >
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => {
                const selected = draft.branding.primaryColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      onChange({
                        branding: { ...draft.branding, primaryColor: c }
                      })
                    }
                    className={cn(
                      "h-8 w-8 rounded-md transition-all",
                      selected
                        ? "ring-2 ring-offset-2 ring-fg ring-offset-bg scale-105"
                        : "hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                );
              })}
            </div>
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
        <SectionHeader title="Privacy settings" required />
        <ul className="space-y-2">
          {PRIVACY_OPTIONS.map((p) => {
            const selected = draft.privacy === p.value;
            return (
              <li key={p.value}>
                <button
                  type="button"
                  onClick={() => onChange({ privacy: p.value })}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                      : "border-border hover:border-fg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      selected ? "border-accent bg-accent" : "border-border"
                    )}
                  >
                    {selected ? (
                      <span className="h-2 w-2 rounded-full bg-bg" />
                    ) : null}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-fg">
                      {p.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">
                      {p.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <FieldStyle />
    </div>
  );
}

export function Field({
  label,
  schemaTag,
  hint,
  required,
  children
}: {
  label: string;
  schemaTag?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="font-mono text-[11px] uppercase tracking-widest text-fg">
          {label}
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </label>
        {schemaTag ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {schemaTag}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p className="text-[11px] text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldStyle() {
  return (
    <style>{`
      .input {
        height: 2.5rem;
        width: 100%;
        border-radius: 0.375rem;
        border: 1px solid var(--border);
        background: var(--surface-1);
        padding: 0 0.75rem;
        color: var(--fg);
        font-size: 13px;
      }
      .input:focus {
        outline: none;
        border-color: var(--accent);
      }
      .input:disabled, .input[readonly] {
        opacity: 0.7;
      }
      textarea.input {
        height: auto;
        padding: 0.5rem 0.75rem;
      }
    `}</style>
  );
}
