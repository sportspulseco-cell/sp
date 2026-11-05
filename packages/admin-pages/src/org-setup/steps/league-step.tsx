"use client";

import { Children, cloneElement, isValidElement, useId, useMemo, type ReactElement } from "react";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import { cn, Input, Select, FieldHint } from "@sportspulse/ui";
import {
  slugify,
  type LeagueDraft,
  type LeagueFormat,
  type Privacy
} from "../types";
import styles from "../setup-workspace.module.css";
import { SectionHeader } from "./org-step";
import { LogoUpload, type UploadLogo } from "./logo-upload";

export const FORMATS: { value: LeagueFormat; label: string }[] = [
  { value: "regular", label: "Regular season" },
  { value: "tournament", label: "Tournament" },
  { value: "pickup", label: "Pickup" },
  { value: "friendly", label: "Friendly" }
];

export const TIMEZONES = [
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

export const PRIVACY_OPTIONS: {
  value: Privacy;
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    label: "Public: visible in league directory",
    description:
      "Anyone can find this league, view standings, and browse team profiles. Registration may still require login."
  },
  {
    value: "unlisted",
    label: "Unlisted: accessible via direct link only",
    description:
      "Does not appear in the directory. Only people with the link can register or view. Useful for private corporate leagues."
  },
  {
    value: "private",
    label: "Private: login required to view anything",
    description:
      "All content including standings and schedules requires an authenticated account with a role in this league. Maximum privacy."
  }
];

export function LeagueStep({
  draft,
  org,
  sports,
  governingBodies,
  onChange,
  uploadLogo,
  onUploadBusy,
  nameTaken = false
}: {
  draft: LeagueDraft;
  org: Org | null;
  sports: Sport[];
  governingBodies: GoverningBody[];
  onChange: (patch: Partial<LeagueDraft>) => void;
  uploadLogo?: UploadLogo;
  onUploadBusy?: (busy:boolean)=>void;
  /** The name matches a live league in this org; the API refuses it. */
  nameTaken?: boolean;
}) {
  const filteredBodies = useMemo(
    () =>
      governingBodies.filter(
        (b) => !draft.sportCode || b.sportCode === draft.sportCode
      ),
    [governingBodies, draft.sportCode]
  );

  return (<div className={styles.league+" space-y-6"}>
<section className="space-y-5 rounded-xl border border-border bg-surface-1 p-5 sm:p-6">
<p className="text-[13px] text-fg-muted">{org?.displayName ?? org?.legalName}</p>
<Field
            label="League name"
            required
            hint="Shown to your players and staff."
            error={
              nameTaken
                ? 'A league with this name already exists in this organization. Pick it under "Add to an existing league", or choose another name.'
                : undefined
            }
          >
            <Input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })}
              maxLength={80}
              placeholder="e.g. New Hampshire AHL"
              required
            />
          </Field>
<div className="grid gap-4 sm:grid-cols-2"><Field
            label="Sport"
            required
            hint="Sets the game's rules and statistics."
          >
            <Select
              value={draft.sportCode}
              onChange={(e) => onChange({ sportCode: e.target.value, governingBodyId: null })}
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
            </Select>
          </Field><Field
            label="Time zone"
            required
            hint="Use the time zone of your rinks."
          >
            <Select
              value={draft.timezone}
              onChange={(e) => onChange({ timezone: e.target.value })}
            >
              {TIMEZONES.includes(draft.timezone) ? null : (
                <option value={draft.timezone}>{draft.timezone}</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field></div>
<Field
            label="League logo"
            hint="Upload a 512×512 PNG or JPG (max 2 MB)."
          >
            <LogoUpload value={draft.branding.logoUrl} upload={uploadLogo} onBusy={onUploadBusy}
              onChange={url=>onChange({branding:{...draft.branding,logoUrl:url}})}/>
          </Field>
</section>
<details open={!!draft.name.trim()&&!draft.slug} className="rounded-xl border border-border bg-surface-1 p-5">
<summary className="cursor-pointer text-sm font-medium">League settings <span className="font-normal text-fg-muted">· {FORMATS.find(f=>f.value===draft.format)?.label} · {draft.privacy}</span></summary>
<div className="mt-5 grid gap-4 sm:grid-cols-2"><Field
            label="League web address"
            required
            hint="Part of the league's web address, made from its name. Type here to set your own."
          >
            <Input
              type="text"
              value={draft.slug}
              onChange={(e) => onChange({ slug: slugify(e.target.value) })}
              placeholder="auto-generated"
              className="font-mono"
              required
            />
          </Field><Field
            label="Format"
            required
            hint="Regular season = scheduled games + standings. Tournament = bracket event. This drives how the scheduler and standings engine behave."
          >
            <Select
              value={draft.format}
              onChange={(e) => onChange({ format: e.target.value as LeagueFormat })}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field><Field
            label="Governing body"
            hint="Drives ID verification rules and SafeSport requirements for all seasons in this league. Leave blank if your league isn't sanctioned by one."
          >
            <Select
              value={draft.governingBodyId ?? ""}
              onChange={(e) =>
                onChange({ governingBodyId: e.target.value || null })
              }
            >
              <option value="">None (unsanctioned)</option>
              {filteredBodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field><Field
            label="Primary colour"
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
          </Field></div>
      <section className="mt-5 space-y-4 border-t border-border pt-5">
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
</details>
</div>);
}

export function Field({
  label,
  hint,
  error,
  required,
  children
}: {
  label: string;
  hint?: string;
  /** What is wrong with the value, in plain words; shown under the input. */
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  // Tie the label to the first input, select or textarea child so screen
  // readers (and getByLabel) name it. Binding only a lone child left the
  // League name field, which also carried an error line, with no name.
  const autoId = useId();
  const errorId = `${autoId}-error`;
  let labelFor: string | undefined;
  let bound = false;
  const body = Children.map(children, (child) => {
    if (bound || !isValidElement(child)) return child;
    const el = child as ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
    const t = el.type;
    const inputLike =
      typeof t === "string" ? /^(input|select|textarea)$/.test(t) : t === Input || t === Select;
    if (!inputLike) return child;
    bound = true;
    labelFor = el.props.id ?? autoId;
    return cloneElement(el, {
      id: labelFor,
      ...(error ? { "aria-invalid": true, "aria-describedby": errorId } : {})
    });
  });
  return (
    <div className="space-y-1.5">
      <label htmlFor={labelFor} className="block font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        {label}
        {required ? <span className="ml-1 text-[var(--error)]">*</span> : null}
      </label>
      {body}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-fg-danger">
          {error}
        </p>
      ) : null}
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}

