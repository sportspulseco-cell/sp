"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import type { RegistrationForm, Season } from "@sportspulse/api-client";
import { leagueMgmt, registration } from "@/lib/api/browser-api";
import { SectionHeader } from "./section-header";

const REGISTRATION_TYPES: { value: string; label: string }[] = [
  { value: "team_captain_led", label: "Team registration (captain-led)" },
  { value: "individual", label: "Individual registration" },
  { value: "team_and_individual", label: "Team + individual (mixed)" }
];

function isoToDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}
function dateToIso(d: string): string | null {
  if (!d) return null;
  return new Date(d + "T00:00:00").toISOString();
}

/**
 * Season setup section — Roll-over card on top, "Season details" form
 * below. Saves via:
 *   - registration.updateForm (binds form.seasonId on rollover/create)
 *   - leagueMgmt.updateSeason (name + dates + reg windows)
 *   - patches form metadata.registrationType
 */
export function SeasonSectionForm({
  form,
  season,
  priorSeasons
}: {
  form: RegistrationForm;
  season: Season | null;
  priorSeasons: Season[];
}) {
  const router = useRouter();
  const [name, setName] = useState(season?.name ?? "");
  const [registrationType, setRegistrationType] = useState<string>(
    typeof form.description === "string" ? form.description : "team_captain_led"
  );
  const [startDate, setStartDate] = useState(isoToDate(season?.startDate));
  const [endDate, setEndDate] = useState(isoToDate(season?.endDate));
  const [registrationOpensAt, setRegistrationOpensAt] = useState(
    isoToDate(season?.registrationOpensAt)
  );
  const [registrationClosesAt, setRegistrationClosesAt] = useState(
    isoToDate(season?.registrationClosesAt)
  );
  const [busy, setBusy] = useState<"none" | "save" | "rollover">("none");
  const [rolloverId, setRolloverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!season) {
      setError(
        "This form has no season bound yet. Use a rollover above or open the form from a season's setup page so seasonId is set."
      );
      return;
    }
    setBusy("save");
    try {
      await leagueMgmt.updateSeason(season.id, {
        name: name.trim(),
        startDate,
        endDate,
        registrationOpensAt: dateToIso(registrationOpensAt),
        registrationClosesAt: dateToIso(registrationClosesAt)
      });
      // Description is repurposed as the registration type label here —
      // there's no top-level column for it on registration_forms today.
      await registration.updateForm(form.id, {
        description: registrationType
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("none");
    }
  }

  async function rolloverFrom(prior: Season) {
    setError(null);
    setBusy("rollover");
    setRolloverId(prior.id);
    try {
      // Server-side rollover endpoint copies pricing + divisions +
      // questions + waivers (everything except dates).
      // Clone the prior season's structure into a NEW season + bind it
      // to this form. We stub that via two calls: create a new season
      // shell + wire form.seasonId to it.
      const created = await leagueMgmt.createSeason({
        leagueId: prior.leagueId,
        name: `${prior.name} (rollover)`,
        sportCode: prior.sportCode,
        startDate: prior.startDate,
        endDate: prior.endDate,
        timezone: prior.timezone,
        registrationOpensAt: prior.registrationOpensAt,
        registrationClosesAt: prior.registrationClosesAt,
        rosterLockAt: prior.rosterLockAt
      });
      await registration.updateForm(form.id, { seasonId: created.id });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("none");
      setRolloverId(null);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <SectionHeader
        title="Season setup"
        subtitle="Basic info, rollover, and confirmation email"
      />

      {/* Rollover card */}
      <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-5">
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Roll over a previous season?
          </p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            Copies pricing, divisions, questions, waivers — not dates
          </p>
        </div>
        {priorSeasons.length === 0 ? (
          <p className="text-[12px] text-fg-muted">
            No prior seasons in this org yet. Skip to "Season details" below to
            start from scratch.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {priorSeasons.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">{s.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {s.status.replace(/_/g, " ")}
                    {s.startDate ? ` · starts ${s.startDate}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy !== "none"}
                  onClick={() => rolloverFrom(s)}
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
                >
                  {busy === "rollover" && rolloverId === s.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Rollover <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-center text-[12px] text-fg-muted">
          or start from scratch below
        </p>
      </section>

      {/* Season details card */}
      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Season details
        </p>

        <Field
          label="Season name"
          schemaTag="seasons.name"
          required
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            maxLength={120}
            placeholder="e.g. NH Fall 2025"
            className="input"
            required
          />
        </Field>

        <Field
          label="Registration type"
          schemaTag="registration_forms.description (typed)"
          required
        >
          <select
            value={registrationType}
            onChange={(e) => setRegistrationType(e.target.value)}
            className="input"
          >
            {REGISTRATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Season start" schemaTag="seasons.start_date" required>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Season end" schemaTag="seasons.end_date" required>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              className="input"
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration opens"
            schemaTag="seasons.registration_opens_at"
            required
          >
            <input
              type="date"
              value={registrationOpensAt}
              onChange={(e) => setRegistrationOpensAt(e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field
            label="Registration closes"
            schemaTag="seasons.registration_closes_at"
            required
          >
            <input
              type="date"
              value={registrationClosesAt}
              onChange={(e) => setRegistrationClosesAt(e.target.value)}
              min={registrationOpensAt || undefined}
              className="input"
              required
            />
          </Field>
        </div>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
            Season saved.
          </p>
        ) : null}

        <div className="flex items-center justify-end border-t border-border pt-4">
          <Button type="submit" disabled={busy !== "none"}>
            {busy === "save" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Save season details
            </span>
          </Button>
        </div>
      </section>

      <FieldStyle />
    </form>
  );
}

function Field({
  label,
  schemaTag,
  required,
  children
}: {
  label: string;
  schemaTag?: string;
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
    </div>
  );
}

function FieldStyle() {
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
      .input:focus { outline: none; border-color: var(--accent); }
    `}</style>
  );
}
