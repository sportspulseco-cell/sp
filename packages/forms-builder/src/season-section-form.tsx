"use client";
import { fetchAll } from "@sportspulse/api-client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Alert, Button, Skeleton, Select } from "@sportspulse/ui";
import type { RegistrationForm, Season } from "@sportspulse/api-client";
import {
  SEASON_REGISTRATION_TYPES,
  SEASON_REGISTRATION_TYPE_LABELS,
  SYSTEM_ROLE_BY_CODE,
  seasonRegistrationType,
  type SeasonRegistrationType,
  formatCalendarDate,
  formatInZone
} from "@sportspulse/kernel";
import { Badge } from "@sportspulse/ui";
import { useFormsBuilderApi } from "./context";
import { SectionHeader } from "./section-header";


/** A season date as written (no zone shift: Nov 22 never reads Nov 21). */
function fmtDate(value: string | null | undefined): string {
  return formatCalendarDate(value) || "—";
}

/** A season moment (registration opens, roster lock) in the season's zone. */
function fmtMoment(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  return formatInZone(iso, timeZone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
  const { leagueMgmt, registration } = useFormsBuilderApi();
  const router = useRouter();
  const [seasonId, setSeasonId] = useState<string>(form.seasonId ?? "");
  // REG-14: the registration type lives on the season (seasons.config),
  // where the funnel and the API read it. It used to be written into the
  // form's description, which nothing read (and the save was a no-op).
  const [registrationType, setRegistrationType] = useState<SeasonRegistrationType>(
    seasonRegistrationType(season?.config ?? null)
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
    fetchAll((cursor) => leagueMgmt
      .listSeasons({ orgId: form.orgId, limit: 100, cursor }))
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

  // Follow the bound season: picking another season shows its type.
  useEffect(() => {
    if (selectedSeason) {
      setRegistrationType(seasonRegistrationType(selectedSeason.config ?? null));
    }
  }, [selectedSeason?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!seasonId) {
      setError("Pick the season first. The registration type is saved on the season.");
      return;
    }
    setError(null);
    setSaved(false);
    setBusy("type");
    try {
      const res = await leagueMgmt.updateSeasonConfig(seasonId, {
        registrationType
      });
      // Show Saved only when the stored value reads back as chosen.
      const stored = seasonRegistrationType(res?.config ?? null);
      setRegistrationType(stored);
      setAllSeasons((prev) =>
        prev.map((s) => (s.id === seasonId ? { ...s, config: res?.config ?? s.config } : s))
      );
      if (stored !== registrationType) {
        setError("The season did not keep this registration type. Reload and try again.");
      } else {
        setSaved(true);
      }
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
        subtitle="Pick the season this registration runs against (created in Org setup)"
      />

      {/* Rollover card */}
      <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-5">
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Roll over a previous season?
          </p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            Copies pricing, divisions, questions and waivers, not dates
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
          required
          hint="Seasons are created in Org setup. Pick one to bind this registration form to it; the rest of the wizard reads its config from the selected season."
        >
          {seasonsLoading ? (
            <div role="status" aria-label="Loading seasons"><Skeleton className="h-9" /></div>
          ) : allSeasons.length === 0 ? (
            <p className="text-[12px] text-fg-muted">
              No seasons in this org yet.{" "}
              <a href="/org-setup" className="underline">
                Create one in Org setup
              </a>
              .
            </p>
          ) : (
            <Select
              value={seasonId}
              onChange={(e) => bindSeason(e.target.value)}
              disabled={busy !== "none"}
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
            </Select>
          )}
        </Field>

        {/* Auto-populated read-only summary */}
        {selectedSeason ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-md border border-border bg-bg-subtle p-4">
            <ReadOnly label="Season name">{selectedSeason.name}</ReadOnly>
            <ReadOnly label="Sport" mono>
              {selectedSeason.sportCode}
            </ReadOnly>
            <ReadOnly label="Time zone" mono>
              {selectedSeason.timezone}
            </ReadOnly>
            <ReadOnly label="Season start" mono>
              {fmtDate(selectedSeason.startDate)}
            </ReadOnly>
            <ReadOnly label="Season end" mono>
              {fmtDate(selectedSeason.endDate)}
            </ReadOnly>
            <ReadOnly label="Status" mono>
              {selectedSeason.status.replace(/_/g, " ")}
            </ReadOnly>
            <ReadOnly label="Registration opens" mono>
              {fmtMoment(selectedSeason.registrationOpensAt, selectedSeason.timezone)}
            </ReadOnly>
            <ReadOnly label="Registration closes" mono>
              {fmtMoment(selectedSeason.registrationClosesAt, selectedSeason.timezone)}
            </ReadOnly>
            <ReadOnly label="Roster lock" mono>
              {fmtMoment(selectedSeason.rosterLockAt, selectedSeason.timezone)}
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
          required
          hint="Decides which paths players see. Team: captains register teams and players join from their captain's invite link. Individual: players register themselves, and as free agents when that is allowed under Divisions & eligibility. Saved on the season."
        >
          <div className="flex items-center gap-2">
            <Select
              aria-label="Registration type"
              value={registrationType}
              onChange={(e) =>
                setRegistrationType(e.target.value as SeasonRegistrationType)
              }
              disabled={!seasonId || busy !== "none"}
            >
              {SEASON_REGISTRATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SEASON_REGISTRATION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={saveRegistrationType}
              disabled={!seasonId || busy !== "none"}
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
          <Alert tone="error">
            {error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert tone="success" role="status">
            Saved.
          </Alert>
        ) : null}
      </section>

      <EligibilityPanel form={form} />

    </div>
  );
}

/**
 * Read-only display of who this form is shown to. Ported here from the
 * old version-wizard's EligibilityStep when the wizard was removed
 * (CLAUDE.md "reuse over silos" — no parallel implementations). Pure
 * metadata view; edits happen on form create.
 */
function EligibilityPanel({ form }: { form: RegistrationForm }) {
  const roles =
    form.appliesToRoles.length === 0
      ? [{ code: "*", name: "All roles in scope" }]
      : form.appliesToRoles.map((c) => ({
          code: c,
          name: SYSTEM_ROLE_BY_CODE[c]?.name ?? c
        }));
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Eligibility
        </p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Who this form is shown to when admins or registrants land on the
          funnel. Set on the form metadata at creation; edit on the forms
          list page if you need to re-scope.
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Scope type
          </p>
          <p className="mt-1 font-mono uppercase text-fg">{form.scope}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Scope ID
          </p>
          <p className="mt-1 font-mono text-[11px] text-fg-muted">
            {form.scopeId ?? "—"}
          </p>
        </div>
      </dl>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Applies to roles
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <Badge key={r.code} mono>
              {r.name}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-mono text-[11px] uppercase tracking-widest text-fg">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

function ReadOnly({
  label,
  mono,
  children
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
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

