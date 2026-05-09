"use client";

import { useEffect, useState } from "react";
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Season setup section — picks an EXISTING season from /org-setup and
 * binds it to this form. Per repo owner directive: seasons aren't
 * created here, they're created in /org-setup. Selecting a season
 * auto-populates the read-only summary below; the rest of the wizard
 * (Pricing, Divisions, Email templates) keys off this seasonId.
 *
 * Top "Rollover" card stays as a fast path for spawning a NEW season
 * from a prior one (calls leagueMgmt.createSeason then binds).
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
  const [seasonId, setSeasonId] = useState<string>(form.seasonId ?? "");
  const [registrationType, setRegistrationType] = useState<string>(
    typeof form.description === "string" ? form.description : "team_captain_led"
  );
  const [allSeasons, setAllSeasons] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [busy, setBusy] = useState<"none" | "bind" | "rollover" | "type">("none");
  const [rolloverId, setRolloverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Pull every season in the org so the dropdown can show all options.
  useEffect(() => {
    let alive = true;
    leagueMgmt
      .listSeasons({ orgId: form.orgId })
      .then((page) => {
        if (!alive) return;
        const items = (page.items ?? []).slice().sort((a, b) =>
          (b.startDate ?? "").localeCompare(a.startDate ?? "")
        );
        setAllSeasons(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSeasonsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [form.orgId]);

  // Find the currently-selected season's full record so the read-only
  // panel shows fresh data even before router.refresh kicks in.
  const selectedSeason =
    allSeasons.find((s) => s.id === seasonId) ?? season ?? null;

  async function bindSeason(nextSeasonId: string) {
    setError(null);
    setSaved(false);
    setBusy("bind");
    try {
      await registration.updateForm(form.id, {
        seasonId: nextSeasonId || null
      });
      setSeasonId(nextSeasonId);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("none");
    }
  }

  async function saveRegistrationType() {
    setError(null);
    setSaved(false);
    setBusy("type");
    try {
      await registration.updateForm(form.id, { description: registrationType });
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
      setSeasonId(created.id);
      setAllSeasons((prev) => [created, ...prev]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("none");
      setRolloverId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Season setup"
        subtitle="Pick the season this registration runs against — created via Org setup"
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
            No prior seasons in this org yet. Create one in Org setup, or pick
            an existing one in the dropdown below.
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
      </section>

      {/* Season picker */}
      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Season details
        </p>

        <Field
          label="Season"
          schemaTag="registration_forms.season_id → seasons"
          required
          hint="Seasons are created in Org setup. Pick one to bind this registration form to it; the rest of the wizard reads its config from the seasons table."
        >
          {seasonsLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-fg-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading seasons…
            </div>
          ) : allSeasons.length === 0 ? (
            <p className="text-[12px] text-fg-muted">
              No seasons in this org yet.{" "}
              <a href="/org-setup" className="underline">
                Create one in Org setup
              </a>
              .
            </p>
          ) : (
            <select
              value={seasonId}
              onChange={(e) => bindSeason(e.target.value)}
              disabled={busy !== "none"}
              className="input"
              required
            >
              <option value="" disabled>
                Pick a season…
              </option>
              {allSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.startDate} → {s.endDate}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Auto-populated read-only summary */}
        {selectedSeason ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-md border border-border bg-bg-subtle p-4">
            <ReadOnly label="Season name" tag="seasons.name">
              {selectedSeason.name}
            </ReadOnly>
            <ReadOnly label="Sport" tag="seasons.sport_code" mono>
              {selectedSeason.sportCode}
            </ReadOnly>
            <ReadOnly label="Time zone" tag="seasons.timezone" mono>
              {selectedSeason.timezone}
            </ReadOnly>
            <ReadOnly label="Season start" tag="seasons.start_date" mono>
              {fmtDate(selectedSeason.startDate)}
            </ReadOnly>
            <ReadOnly label="Season end" tag="seasons.end_date" mono>
              {fmtDate(selectedSeason.endDate)}
            </ReadOnly>
            <ReadOnly label="Status" tag="seasons.status" mono>
              {selectedSeason.status.replace(/_/g, " ")}
            </ReadOnly>
            <ReadOnly
              label="Registration opens"
              tag="seasons.registration_opens_at"
              mono
            >
              {fmtDate(selectedSeason.registrationOpensAt)}
            </ReadOnly>
            <ReadOnly
              label="Registration closes"
              tag="seasons.registration_closes_at"
              mono
            >
              {fmtDate(selectedSeason.registrationClosesAt)}
            </ReadOnly>
            <ReadOnly label="Roster lock" tag="seasons.roster_lock_at" mono>
              {fmtDate(selectedSeason.rosterLockAt)}
            </ReadOnly>
          </dl>
        ) : null}

        {selectedSeason ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Need to change these dates?{" "}
            <a href="/org-setup" className="underline">
              Edit in Org setup →
            </a>
          </p>
        ) : null}

        <Field
          label="Registration type"
          schemaTag="registration_forms.description (typed)"
          required
        >
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={saveRegistrationType}
              disabled={busy !== "none"}
            >
              {busy === "type" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Save
              </span>
            </Button>
          </div>
        </Field>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
            Saved.
          </p>
        ) : null}
      </section>

      <FieldStyle />
    </div>
  );
}

function Field({
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
      {hint ? <p className="text-[11px] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

function ReadOnly({
  label,
  tag,
  mono,
  children
}: {
  label: string;
  tag?: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </dt>
        {tag ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {tag}
          </span>
        ) : null}
      </div>
      <dd
        className={
          mono ? "mt-1 font-mono text-[12px] text-fg" : "mt-1 text-[13px] text-fg"
        }
      >
        {children}
      </dd>
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
