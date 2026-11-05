"use client";

import { PlayoffSpotsFields } from "../divisions/playoff-spots-fields";
import { PointsRuleFields, pointsRuleForm, pointsRuleFromForm, type PointsRuleForm } from "../divisions/points-rule-fields";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Alert, Button, Dialog, DialogActions, Field, Input, Select } from "@sportspulse/ui";
import { fetchAll, mapLimit, type Division, type GoverningBody, type League, type Org, type Page, type Season, type Team } from "@sportspulse/api-client";
import { FORMATS, PRIVACY_OPTIONS, TIMEZONES } from "../org-setup/steps/league-step";
import { BODY_CHECKING, BRACKETS, CLOCK_TYPES, GENDERS, OVERTIME_RULES, SERIES, TIERS, optionLabel } from "../divisions/option-labels";
import { DEFAULT_TIEBREAKERS, emptyDivision } from "../org-setup/types";
import {
  calendarDateInZone,
  copyDivisionRules,
  divisionNumberProblem,
  endOfDayInZone,
  readDisciplineRules,
  readDivisionRules,
  startOfDayInZone,
  validateDisciplineRules,
  type DisciplineRules,
  type DivisionNumberKey,
  type DivisionRules
} from "@sportspulse/kernel";

/**
 * Edit / add-child dialogs for the admin detail pages (SP-Changes item 2):
 * edit an organization, a league, a season or a division, add a season
 * under a league and a division under a season. Shared by sa-web and
 * org-admin-web; each app injects its own SDK call, so the dialogs never
 * know which console they are in. Every save refreshes the page data.
 */

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, onDone: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function Trigger({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: "edit" | "add";
  onClick: () => void;
}) {
  const Icon = icon === "edit" ? Pencil : Plus;
  return (
    <Button type="button" size="sm" variant={icon === "edit" ? "outline" : "primary"} onClick={onClick}>
      <Icon className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </Button>
  );
}

function Actions({
  busy,
  label,
  onCancel,
  disabled
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <DialogActions>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || disabled}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {label}
      </Button>
    </DialogActions>
  );
}

// ---------- dates ----------

const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
/**
 * ISO timestamp -> YYYY-MM-DD for <input type="date">, as the day reads in
 * the season's own zone. Reading it in the browser's zone showed the day
 * before to anyone west of the season and the day after to anyone east.
 */
function toDateInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return calendarDateInZone(iso, timeZone);
}
/**
 * Same conversion as the Org setup wizard: the typed day starts and ends
 * in the season's zone, never the browser's (PPHL, 4 Nov 2026: "Nov 4"
 * typed from India stored Nov 3 18:30Z and the season page showed Nov 3).
 */
const startOfDay = (d: string, timeZone: string) => (d ? startOfDayInZone(d, timeZone) : null);
const endOfDay = (d: string, timeZone: string) => (d ? endOfDayInZone(d, timeZone) : null);

// ---------- organization ----------

export interface OrgUpdateBody {
  legalName?: string;
  displayName?: string;
  countryCode?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
  defaultTimezone?: string;
}

export function EditOrgButton({
  org,
  save
}: {
  org: Org;
  save: (body: OrgUpdateBody) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useSave();
  const [f, setF] = useState({
    displayName: org.displayName,
    legalName: org.legalName,
    countryCode: org.countryCode,
    defaultLocale: org.defaultLocale,
    defaultCurrency: org.defaultCurrency,
    defaultTimezone: org.defaultTimezone
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <>
      <Trigger label="Edit organization" icon="edit" onClick={() => setOpen(true)} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit organization" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(() => save(f), () => setOpen(false));
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <Input required maxLength={120} value={f.displayName} onChange={(e) => set("displayName", e.target.value)} />
            </Field>
            <Field label="Legal name">
              <Input required maxLength={160} value={f.legalName} onChange={(e) => set("legalName", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Country" hint="ISO-3166 alpha-2">
              <Input required maxLength={2} value={f.countryCode} onChange={(e) => set("countryCode", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Locale">
              <Input required value={f.defaultLocale} onChange={(e) => set("defaultLocale", e.target.value)} />
            </Field>
            <Field label="Currency" hint="ISO-4217">
              <Input required maxLength={3} value={f.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value.toUpperCase())} />
            </Field>
          </div>
          <Field label="Timezone">
            <Select value={f.defaultTimezone} onChange={(e) => set("defaultTimezone", e.target.value)}>
              {[...new Set([f.defaultTimezone, ...TIMEZONES])].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[12px] text-fg-muted">The slug and organization type cannot be changed.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Save organization" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

// ---------- league ----------

export interface LeagueUpdateBody {
  name?: string;
  format?: League["format"];
  governingBodyId?: string | null;
  metadata?: Record<string, unknown>;
}

export function EditLeagueButton({
  league,
  governingBodies,
  save
}: {
  league: League;
  /** Governing bodies of the league's sport (dropdown by name). */
  governingBodies: GoverningBody[];
  save: (body: LeagueUpdateBody) => Promise<unknown>;
}) {
  const md = (league.metadata ?? {}) as {
    privacy?: string;
    timezone?: string;
    branding?: { logoUrl?: string | null; primaryColor?: string };
    discipline?: unknown;
  };
  const [open, setOpen] = useState(false);
  const { busy, error, setError, run } = useSave();
  // Automatic suspensions (COMP-11): the league's saved rules, or the defaults.
  const [disc, setDisc] = useState<DisciplineRules>(() => readDisciplineRules(md.discipline));
  const setD = <K extends keyof DisciplineRules>(k: K, v: DisciplineRules[K]) => setDisc((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const [f, setF] = useState({
    name: league.name,
    format: league.format,
    governingBodyId: league.governingBodyId ?? "",
    privacy: md.privacy ?? "public",
    timezone: md.timezone ?? "America/New_York",
    primaryColor: md.branding?.primaryColor ?? "#3B82F6",
    logoUrl: md.branding?.logoUrl ?? ""
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const bodies = governingBodies.filter((b) => b.sportCode === league.sportCode || b.id === league.governingBodyId);
  return (
    <>
      <Trigger label="Edit league" icon="edit" onClick={() => setOpen(true)} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit league" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const problem = validateDisciplineRules(disc);
            if (problem) return setError(problem);
            void run(
              () =>
                save({
                  name: f.name.trim(),
                  // Format is locked once the league leaves draft; send it
                  // only when it actually changed.
                  ...(f.format !== league.format ? { format: f.format } : {}),
                  governingBodyId: f.governingBodyId || null,
                  // Keep keys the form does not edit (slug, etc.).
                  metadata: {
                    ...md,
                    privacy: f.privacy,
                    timezone: f.timezone,
                    branding: { ...(md.branding ?? {}), primaryColor: f.primaryColor, logoUrl: f.logoUrl || null },
                    discipline: disc
                  }
                }),
              () => setOpen(false)
            );
          }}
        >
          <Field label="League name">
            <Input required maxLength={120} value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Format"
              hint={league.status === "draft" ? undefined : "Fixed once the league is published."}
            >
              <Select
                value={f.format}
                disabled={league.status !== "draft"}
                onChange={(e) => set("format", e.target.value as League["format"])}
              >
                {FORMATS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Governing body">
              <Select value={f.governingBodyId} onChange={(e) => set("governingBodyId", e.target.value)}>
                <option value="">None</option>
                {bodies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Privacy">
              <Select value={f.privacy} onChange={(e) => set("privacy", e.target.value)}>
                {PRIVACY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone">
              <Select value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {[...new Set([f.timezone, ...TIMEZONES])].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Primary colour">
              <Input type="color" value={f.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
            </Field>
            <Field label="Logo URL" hint="Optional">
              <Input type="url" value={f.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://" />
            </Field>
          </div>
          <fieldset className="space-y-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-[12px] font-medium text-fg">Discipline</legend>
            <label className="flex items-center gap-2 text-[13px] text-fg">
              <input type="checkbox" checked={disc.enabled} onChange={(e) => setD("enabled", e.target.checked)} />
              Suspend players automatically when a game is finalized
            </label>
            {disc.enabled ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Games for a game misconduct" hint="0 = none. USA Hockey: the next game.">
                    <Input type="number" min={0} max={99} value={String(disc.gameMisconductGames)} onChange={(e) => setD("gameMisconductGames", num(e.target.value))} />
                  </Field>
                  <Field label="Games for a second major in one game" hint="0 = none.">
                    <Input type="number" min={0} max={99} value={String(disc.secondMajorGames)} onChange={(e) => setD("secondMajorGames", num(e.target.value))} />
                  </Field>
                  <Field label="Misconducts per suspension" hint="Counted per season. 0 = off.">
                    <Input type="number" min={0} max={99} value={String(disc.misconductsPerSuspension)} onChange={(e) => setD("misconductsPerSuspension", num(e.target.value))} />
                  </Field>
                  <Field label="Games per misconduct suspension">
                    <Input type="number" min={1} max={99} value={String(disc.misconductSuspensionGames)} onChange={(e) => setD("misconductSuspensionGames", num(e.target.value))} />
                  </Field>
                  <Field label="Penalty minutes per suspension" hint="Counted per season. 0 = off.">
                    <Input type="number" min={0} max={999} value={String(disc.pimPerSuspension)} onChange={(e) => setD("pimPerSuspension", num(e.target.value))} />
                  </Field>
                  <Field label="Games per penalty-minute suspension">
                    <Input type="number" min={1} max={99} value={String(disc.pimSuspensionGames)} onChange={(e) => setD("pimSuspensionGames", num(e.target.value))} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    checked={disc.matchPenaltyUntilLifted}
                    onChange={(e) => setD("matchPenaltyUntilLifted", e.target.checked)}
                  />
                  A match penalty suspends the player until a league admin lifts it
                </label>
                <p className="text-[12px] text-fg-muted">
                  Rules that apply in the same game add up. Players, their captains and the league admins are told.
                </p>
              </>
            ) : (
              <p className="text-[12px] text-fg-muted">Admins can still suspend a player from a penalty on the game page.</p>
            )}
          </fieldset>
          <p className="text-[12px] text-fg-muted">Sport and organization are fixed once the league exists.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Save league" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

// ---------- season ----------

export interface SeasonCreateBody {
  leagueId: string;
  name: string;
  sportCode: string;
  startDate: string;
  endDate: string;
  playoffStartDate: string | null;
  playoffEndDate: string | null;
  timezone: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  rosterLockAt: string | null;
}
export type SeasonUpdateBody = Partial<Omit<SeasonCreateBody, "leagueId" | "sportCode">>;

type SeasonForm = {
  name: string;
  startDate: string;
  endDate: string;
  playoffStartDate: string;
  playoffEndDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  rosterLockAt: string;
};

/**
 * Same checks as Org setup step 3. Registration and roster-lock dates
 * follow one rule on create and edit (the API applies it too): a date you
 * set or change must be today or later; a date already saved stays.
 * Season dates may be corrected into the past only when editing.
 */
function seasonProblem(f: SeasonForm, saved: SeasonForm | null): string | null {
  const t = today();
  const moved = (k: keyof SeasonForm) => !!f[k] && f[k] < t && f[k] !== saved?.[k];
  if (!f.name.trim()) return "Season name is required.";
  if (!f.startDate || !f.endDate) return "Season start and end dates are required.";
  if (f.endDate < f.startDate) return "Season end must be on or after its start.";
  if (!saved && (f.startDate < t || f.endDate < t)) return "A new season cannot start or end in the past.";
  if (moved("registrationOpensAt")) return "Registration cannot open in the past.";
  if (moved("registrationClosesAt")) return "Registration cannot close in the past.";
  if (moved("rosterLockAt")) return "Roster lock cannot be in the past.";
  if (f.registrationOpensAt && f.registrationClosesAt && f.registrationClosesAt < f.registrationOpensAt)
    return "Registration must close on or after it opens.";
  const anyPlayoff = !!f.playoffStartDate || !!f.playoffEndDate;
  if (anyPlayoff) {
    if (!f.playoffStartDate || !f.playoffEndDate) return "Set both playoff dates, or neither.";
    if (f.playoffStartDate < f.startDate || f.playoffEndDate > f.endDate)
      return "The playoff window must sit inside the season dates.";
    if (f.playoffEndDate < f.playoffStartDate) return "Playoff end must be on or after playoff start.";
  }
  return null;
}

function SeasonFields({ f, set }: { f: SeasonForm; set: (k: keyof SeasonForm, v: string) => void }) {
  const date = (k: keyof SeasonForm, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="date" value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  return (
    <>
      <Field label="Season name">
        <Input required maxLength={120} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Winter 2026-27" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {date("startDate", "Season start")}
        {date("endDate", "Season end")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {date("playoffStartDate", "Playoff start", "Optional")}
        {date("playoffEndDate", "Playoff end", "Optional")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {date("registrationOpensAt", "Registration opens", "Today or later. Today opens it now.")}
        {date("registrationClosesAt", "Registration closes", "Today or later")}
        {date("rosterLockAt", "Roster lock", "Optional. Today or later")}
      </div>
    </>
  );
}

function toSeasonBody(f: SeasonForm, timeZone: string) {
  return {
    name: f.name.trim(),
    startDate: f.startDate,
    endDate: f.endDate,
    playoffStartDate: f.playoffStartDate || null,
    playoffEndDate: f.playoffEndDate || null,
    registrationOpensAt: startOfDay(f.registrationOpensAt, timeZone),
    registrationClosesAt: endOfDay(f.registrationClosesAt, timeZone),
    rosterLockAt: endOfDay(f.rosterLockAt, timeZone)
  };
}

export function NewSeasonButton({
  league,
  create
}: {
  league: League;
  create: (body: SeasonCreateBody) => Promise<unknown>;
}) {
  const empty: SeasonForm = {
    name: "",
    startDate: "",
    endDate: "",
    playoffStartDate: "",
    playoffEndDate: "",
    registrationOpensAt: "",
    registrationClosesAt: "",
    rosterLockAt: ""
  };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<SeasonForm>(empty);
  const { busy, error, setError, run } = useSave();
  const tz = ((league.metadata ?? {}) as { timezone?: string }).timezone ?? "America/New_York";
  return (
    <>
      <Trigger label="New season" icon="add" onClick={() => { setF(empty); setError(null); setOpen(true); }} />
      <Dialog open={open} onClose={() => setOpen(false)} title={`New season in ${league.name}`} size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const p = seasonProblem(f, null);
            if (p) return setError(p);
            void run(
              () => create({ ...toSeasonBody(f, tz), leagueId: league.id, sportCode: league.sportCode, timezone: tz }),
              () => setOpen(false)
            );
          }}
        >
          <SeasonFields f={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} />
          <p className="text-[12px] text-fg-muted">The season starts as Draft. Add its divisions from the season page.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Create season" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

export function EditSeasonButton({
  season,
  save
}: {
  season: Season;
  save: (body: SeasonUpdateBody) => Promise<unknown>;
}) {
  // Dates are typed and read back in the season's own zone.
  const tz = season.timezone;
  const initial: SeasonForm = {
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    playoffStartDate: season.playoffStartDate ?? "",
    playoffEndDate: season.playoffEndDate ?? "",
    registrationOpensAt: toDateInput(season.registrationOpensAt, tz),
    registrationClosesAt: toDateInput(season.registrationClosesAt, tz),
    rosterLockAt: toDateInput(season.rosterLockAt, tz)
  };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<SeasonForm>(initial);
  const { busy, error, setError, run } = useSave();
  return (
    <>
      <Trigger label="Edit season" icon="edit" onClick={() => { setF(initial); setError(null); setOpen(true); }} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit season" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const p = seasonProblem(f, initial);
            if (p) return setError(p);
            // Send only the timestamps the admin changed: resending an
            // untouched date as local midnight moved it (PPHL F-6 check).
            const body: SeasonUpdateBody = toSeasonBody(f, tz);
            for (const k of ["registrationOpensAt", "registrationClosesAt", "rosterLockAt"] as const) {
              if (f[k] === initial[k]) delete body[k];
            }
            void run(() => save(body), () => setOpen(false));
          }}
        >
          <SeasonFields f={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} />
          <p className="text-[12px] text-fg-muted">Status is changed with the status button on the season page.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Save season" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

// ---------- division ----------

export interface DivisionCreateBody {
  seasonId: string;
  name: string;
  tier: string | null;
  ageGroupId: string | null;
  regionId: string | null;
  genderEligibility: "open" | "male" | "female" | "mixed";
  maxTeams: number;
  ruleSetOverrides: Record<string, unknown>;
  playoffConfig: Record<string, unknown>;
}
export interface DivisionUpdateBody {
  name?: string;
  tier?: string | null;
  regionId?: string | null;
  genderEligibility?: "open" | "male" | "female" | "mixed";
  maxTeams?: number | null;
  ruleSetOverrides?: Record<string, unknown>;
  /** The stored config with playoffSpots replaced; only sent when playoffs are on. */
  playoffConfig?: Record<string, unknown>;
}

type DivisionForm = {
  name: string;
  tier: string;
  genderEligibility: "open" | "male" | "female" | "mixed";
  maxTeams: string;
  regionId: string;
  ageMin: string;
  ageMax: string;
  ageLabel: string;
  numberOfPeriods: string;
  periodLengthMin: string;
  maxRosterSize: string;
  points: PointsRuleForm;
  /** null = every team in the division; a number = Top N. */
  playoffSpots: number | null;
  playoffOvertimeRule?: string;
};

function DivisionFields({
  f,
  set,
  playoffsOn,
  regions
}: {
  f: DivisionForm;
  set: <K extends keyof DivisionForm>(k: K, v: DivisionForm[K]) => void;
  /** Playoffs are on in the division's settings, so the spots choice shows. */
  playoffsOn: boolean;
  regions: Array<{ id: string; name: string }>;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Division name">
          <Input required maxLength={120} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Region" hint={regions.length === 0 ? "This organization has no regions yet." : undefined}>
          <Select value={f.regionId} onChange={(e) => set("regionId", e.target.value)} disabled={regions.length === 0}>
            <option value="">No region</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Skill / tier">
          <Select value={f.tier} onChange={(e) => set("tier", e.target.value)}>
            <option value="">No tier</option>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gender eligibility">
          <Select value={f.genderEligibility} onChange={(e) => set("genderEligibility", e.target.value as DivisionForm["genderEligibility"])}>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Max teams">
          <Input type="number" min={2} value={f.maxTeams} onChange={(e) => set("maxTeams", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Min age">
          <Input type="number" min={0} value={f.ageMin} onChange={(e) => set("ageMin", e.target.value)} />
        </Field>
        <Field label="Max age">
          <Input type="number" min={0} value={f.ageMax} onChange={(e) => set("ageMax", e.target.value)} />
        </Field>
        <Field label="Age group label">
          <Input maxLength={60} value={f.ageLabel} onChange={(e) => set("ageLabel", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Number of periods">
          <Input type="number" min={1} max={5} value={f.numberOfPeriods} onChange={(e) => set("numberOfPeriods", e.target.value)} />
        </Field>
        <Field label="Period length (min)">
          <Input type="number" min={1} max={60} value={f.periodLengthMin} onChange={(e) => set("periodLengthMin", e.target.value)} />
        </Field>
        <Field label="Max roster size">
          <Input type="number" min={1} value={f.maxRosterSize} onChange={(e) => set("maxRosterSize", e.target.value)} />
        </Field>
      </div>
      <PointsRuleFields value={f.points} onChange={(next) => set("points", next)} />
      {playoffsOn ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Playoff overtime" hint="Independent from the regular-season overtime rule."><Select value={f.playoffOvertimeRule ?? ""} onChange={e=>set("playoffOvertimeRule",e.target.value)}><option value="">Same as regular season</option>{OVERTIME_RULES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <PlayoffSpotsFields value={f.playoffSpots} onChange={(next) => set("playoffSpots", next)} max={32} />
        </div>
      ) : null}
    </>
  );
}

/** The number fields the dialog has, in form order; a blank one keeps the stored value. */
const DIALOG_NUMBERS: Array<[keyof DivisionForm & DivisionNumberKey, DivisionNumberKey]> = [
  ["maxTeams", "maxTeams"],
  ["numberOfPeriods", "numberOfPeriods"],
  ["periodLengthMin", "periodLengthMin"],
  ["maxRosterSize", "maxRosterSize"]
];

function divisionProblem(f: DivisionForm): string | null {
  if (!f.name.trim()) return "Division name is required.";
  // Same ranges and sentences as the wizard and the API (kernel).
  for (const [field, key] of DIALOG_NUMBERS) {
    const text = f[field];
    if (text === "") continue;
    const problem = divisionNumberProblem(key, Number(text));
    if (problem) return problem;
  }
  if (f.ageMin && f.ageMax && Number(f.ageMax) < Number(f.ageMin)) return "Max age must be at least min age.";
  const pts = pointsRuleFromForm(f.points);
  if ("problem" in pts) return pts.problem;
  return null;
}

const num = (s: string) => (s === "" ? null : Number(s));

/** Merge the form into the division's existing rule set (keeps tiebreakers etc.). */
function mergedRules(existing: Record<string, unknown>, f: DivisionForm): Record<string, unknown> {
  const gameRules = { ...((existing.gameRules as Record<string, unknown>) ?? {}) };
  if (f.numberOfPeriods) gameRules.numberOfPeriods = Number(f.numberOfPeriods);
  if (f.periodLengthMin) gameRules.periodLengthMin = Number(f.periodLengthMin);
  if (f.maxRosterSize) gameRules.maxRosterSize = Number(f.maxRosterSize);
  const pts = pointsRuleFromForm(f.points);
  return {
    ...existing,
    gameRules,
    ageRange: { min: num(f.ageMin), max: num(f.ageMax), label: f.ageLabel },
    ...("rule" in pts ? { pointsRule: pts.rule } : {})
  };
}

/** Divisions an admin may copy settings from, with the seasons that name them. */
export interface DivisionCopySources {
  seasons: Season[];
  divisions: Division[];
}

/**
 * Every division of the organization, through the list calls the pages
 * already use (no new endpoint). One request per season, four in flight
 * at most (CONSOLE-22). The API's scope filter keeps other organizations
 * out for org admins.
 */
export async function loadDivisionCopySources(
  api: {
    listSeasons: (q: { orgId?: string; limit?: number; cursor?: string }) => Promise<Page<Season>>;
    listDivisions: (q: { seasonId?: string; limit?: number; cursor?: string }) => Promise<Page<Division>>;
  },
  orgId: string
): Promise<DivisionCopySources> {
  const seasons = (await fetchAll((cursor) => api.listSeasons({ orgId, limit: 100, cursor }))).items;
  const pages = await mapLimit(seasons, 4, (s) =>
    fetchAll((cursor) => api.listDivisions({ seasonId: s.id, limit: 100, cursor }))
  );
  return { seasons, divisions: pages.flatMap((p) => p.items) };
}

/** Newest season first: by start date, then by creation. */
function newestSeasonFirst(a: Season, b: Season): number {
  return (b.startDate ?? "").localeCompare(a.startDate ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

/** What the copy carries that the dialog has no fields for, so nothing is written unseen. */
function carriedSummary(rules: DivisionRules, sameSeason: boolean): string {
  const g = rules.gameRules;
  const p = rules.playoffConfig;
  const short = { short: true };
  const parts = [
    optionLabel(CLOCK_TYPES, g.clockType, short),
    `Overtime: ${optionLabel(OVERTIME_RULES, g.overtimeRule, short)}`,
    `Body checking: ${optionLabel(BODY_CHECKING, g.bodyChecking, short).toLowerCase()}`,
    `${g.minStartersToStart} skaters to start`,
    `${g.maxGuestPlayersPerGame} guest players per game`,
    "Tiebreaker order",
    // Playoff spots are a field of the dialog, so they are not listed here.
    p.enabled
      ? `Playoffs: ${optionLabel(SERIES, p.seriesFormat, short).toLowerCase()}, ${optionLabel(BRACKETS, p.bracketType, short).toLowerCase()}`
      : "No playoffs"
  ];
  return `Also copied: ${parts.join(" · ")}.${sameSeason ? "" : " Playoff dates are not copied from another season."}`;
}

/**
 * New division. On a season page pass `season` (and that season's
 * `divisions`). On the Divisions list pass `seasons` (and `loadRegions`):
 * the dialog asks for the season first, so adding a division never means
 * setting up a new season (PPHL, 28 Oct 2026).
 *
 * "Copy settings from" (PPHL letter item 5) lists the organization's
 * divisions, this season first, then other seasons newest first. Picking
 * one fills every field from that division and carries the settings the
 * dialog has no fields for (clock, overtime, body checking, min skaters,
 * guest cap, tiebreakers, playoffs). The name is never copied; playoff
 * dates are not copied from another season.
 */
export function NewDivisionButton({
  season: fixedSeason,
  seasons,
  divisions: knownDivisions,
  regions: fixedRegions = [],
  loadRegions,
  loadCopySources,
  create
}: {
  season?: Season;
  seasons?: Season[];
  /** Divisions already loaded by the page (the season page has this season's). */
  divisions?: Division[];
  regions?: Array<{ id: string; name: string }>;
  /** Regions of the picked season's organization. */
  loadRegions?: (orgId: string) => Promise<Array<{ id: string; name: string }>>;
  /** The organization's seasons and divisions, for "Copy settings from". */
  loadCopySources?: (orgId: string) => Promise<DivisionCopySources>;
  create: (body: DivisionCreateBody) => Promise<unknown>;
}) {
  const [seasonId, setSeasonId] = useState(fixedSeason?.id ?? seasons?.[0]?.id ?? "");
  const season = fixedSeason ?? seasons?.find((x) => x.id === seasonId) ?? null;
  const [loadedRegions, setLoadedRegions] = useState<Array<{ id: string; name: string }> | null>(null);
  const orgId = season?.orgId ?? null;
  useEffect(() => {
    if (!loadRegions || !orgId) return;
    let alive = true;
    loadRegions(orgId)
      .then((r) => alive && setLoadedRegions(r))
      .catch(() => alive && setLoadedRegions([]));
    return () => {
      alive = false;
    };
  }, [loadRegions, orgId]);
  const regions = loadedRegions ?? fixedRegions;
  // Same defaults as a fresh division card in the Org setup wizard.
  const d = emptyDivision("new");
  const empty: DivisionForm = {
    name: "",
    tier: d.tier ?? "",
    genderEligibility: d.genderEligibility,
    maxTeams: String(d.maxTeams),
    regionId: "",
    ageMin: "",
    ageMax: "",
    ageLabel: d.ageGroupLabel,
    numberOfPeriods: String(d.gameRules.numberOfPeriods),
    periodLengthMin: String(d.gameRules.periodLengthMin),
    maxRosterSize: String(d.gameRules.maxRosterSize),
    points: pointsRuleForm(null),
    playoffSpots: d.playoffConfig.playoffSpots,
    playoffOvertimeRule: d.playoffConfig.overtimeRule ?? ""
  };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<DivisionForm>(empty);
  const { busy, error, setError, run } = useSave();

  // Copy sources: loaded once per organization, only while the dialog is open.
  const [sources, setSources] = useState<{ orgId: string; data: DivisionCopySources } | null>(null);
  const [sourcesState, setSourcesState] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    if (!open || !loadCopySources || !orgId || sources?.orgId === orgId) return;
    let alive = true;
    setSourcesState("loading");
    loadCopySources(orgId)
      .then((data) => {
        if (!alive) return;
        setSources({ orgId, data });
        setSourcesState("idle");
      })
      .catch(() => alive && setSourcesState("error"));
    return () => {
      alive = false;
    };
  }, [open, loadCopySources, orgId, sources?.orgId]);
  /** The division whose settings fill the form, or null for a blank start. */
  const [source, setSource] = useState<Division | null>(null);

  const byId = new Map<string, Division>();
  for (const x of [...(knownDivisions ?? []), ...(sources?.orgId === orgId ? sources.data.divisions : [])]) byId.set(x.id, x);
  const seasonById = new Map<string, Season>();
  for (const x of [...(season ? [season] : []), ...(seasons ?? []), ...(sources?.orgId === orgId ? sources.data.seasons : [])]) {
    if (x.orgId === orgId) seasonById.set(x.id, x);
  }
  const byName = (a: Division, b: Division) => a.name.localeCompare(b.name);
  const thisSeason = season ? [...byId.values()].filter((x) => x.seasonId === season.id).sort(byName) : [];
  const otherSeasons = [...seasonById.values()]
    .filter((x) => x.id !== season?.id)
    .sort(newestSeasonFirst)
    .map((x) => ({ season: x, divisions: [...byId.values()].filter((y) => y.seasonId === x.id).sort(byName) }))
    .filter((x) => x.divisions.length > 0);
  const hasSources = thisSeason.length > 0 || otherSeasons.length > 0;
  const copyHint =
    sourcesState === "loading" && !hasSources
      ? "Loading divisions"
      : sourcesState === "error" && !hasSources
        ? "Could not load divisions to copy. Try again later."
        : !hasSources
          ? "No divisions to copy yet."
          : undefined;

  const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  function pickSource(id: string) {
    const src = (id && byId.get(id)) || null;
    setSource(src);
    if (!src) {
      // Start blank: back to the defaults, keeping the name typed so far.
      setF((p) => ({ ...empty, name: p.name }));
      return;
    }
    const rules = readDivisionRules(src.ruleSetOverrides, src.playoffConfig);
    setF((p) => ({
      ...p,
      tier: src.tier ?? "",
      genderEligibility: src.genderEligibility,
      maxTeams: src.maxTeams === null || src.maxTeams === undefined ? p.maxTeams : String(src.maxTeams),
      regionId: src.regionId && regions.some((r) => r.id === src.regionId) ? src.regionId : "",
      ageMin: str(rules.ageRange.min),
      ageMax: str(rules.ageRange.max),
      ageLabel: rules.ageRange.label,
      numberOfPeriods: String(rules.gameRules.numberOfPeriods),
      periodLengthMin: String(rules.gameRules.periodLengthMin),
      maxRosterSize: String(rules.gameRules.maxRosterSize),
      points: pointsRuleForm(rules.pointsRule),
      playoffSpots: rules.playoffConfig.playoffSpots,
    playoffOvertimeRule: rules.playoffConfig.overtimeRule ?? ""
    }));
  }
  /** Settings the create body carries beyond the visible fields. Derived at submit, so a season change never leaves them stale. */
  const carried =
    source && season
      ? copyDivisionRules(readDivisionRules(source.ruleSetOverrides, source.playoffConfig), {
          keepPlayoffDates: source.seasonId === season.id
        })
      : null;
  const sourceSeasonName = source ? seasonById.get(source.seasonId)?.name : null;
  /** The playoff settings the new division starts from; the dialog sets only the spots. */
  const basePlayoffs = carried?.playoffConfig ?? d.playoffConfig;

  return (
    <>
      <Trigger
        label="New division"
        icon="add"
        onClick={() => {
          setF(empty);
          setSource(null);
          setError(null);
          setOpen(true);
        }}
      />
      <Dialog open={open} onClose={() => setOpen(false)} title={fixedSeason ? `New division in ${fixedSeason.name}` : "New division"} size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!season) return setError("Pick a season.");
            const p = divisionProblem(f);
            if (p) return setError(p);
            void run(
              () =>
                create({
                  seasonId: season.id,
                  name: f.name.trim(),
                  tier: f.tier || null,
                  ageGroupId: null,
                  regionId: f.regionId || null,
                  genderEligibility: f.genderEligibility,
                  maxTeams: Number(f.maxTeams || d.maxTeams),
                  ruleSetOverrides: mergedRules(
                    carried
                      ? { gameRules: carried.gameRules, tiebreakers: carried.tiebreakers }
                      : { gameRules: d.gameRules, tiebreakers: DEFAULT_TIEBREAKERS },
                    f
                  ),
                  playoffConfig: { ...basePlayoffs, playoffSpots: f.playoffSpots, overtimeRule: f.playoffOvertimeRule || null } as unknown as Record<string, unknown>
                }),
              () => setOpen(false)
            );
          }}
        >
          {fixedSeason ? null : (
            <Field label="Season">
              <Select
                required
                value={seasonId}
                onChange={(e) => {
                  setSeasonId(e.target.value);
                  setLoadedRegions(null);
                  setSource(null);
                  setF((p) => ({ ...p, regionId: "" }));
                }}
              >
                {(seasons ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {loadCopySources || knownDivisions ? (
            <Field label="Copy settings from" hint={copyHint}>
              <Select value={source?.id ?? ""} onChange={(e) => pickSource(e.target.value)} disabled={!hasSources}>
                <option value="">Start blank</option>
                {thisSeason.length > 0 && season ? (
                  <optgroup label="This season">
                    {thisSeason.map((x) => (
                      <option key={x.id} value={x.id}>
                        {season.name} · {x.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherSeasons.length > 0 ? (
                  <optgroup label="Other seasons">
                    {otherSeasons.flatMap((g) =>
                      g.divisions.map((x) => (
                        <option key={x.id} value={x.id}>
                          {g.season.name} · {x.name}
                        </option>
                      ))
                    )}
                  </optgroup>
                ) : null}
              </Select>
            </Field>
          ) : null}
          <DivisionFields f={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} playoffsOn={basePlayoffs.enabled} regions={regions} />
          {carried && source ? (
            <p className="text-[12px] text-fg-muted">
              {sourceSeasonName ? `From ${sourceSeasonName} · ${source.name}. ` : ""}
              {carriedSummary(carried, source.seasonId === season?.id)}
            </p>
          ) : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Create division" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

export function EditDivisionButton({
  division,
  regions,
  save
}: {
  division: Division;
  regions: Array<{ id: string; name: string }>;
  save: (body: DivisionUpdateBody) => Promise<unknown>;
}) {
  const rules = (division.ruleSetOverrides ?? {}) as {
    gameRules?: { numberOfPeriods?: number; periodLengthMin?: number; maxRosterSize?: number };
    ageRange?: { min?: number | null; max?: number | null; label?: string };
  };
  const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const playoffs = readDivisionRules(division.ruleSetOverrides, division.playoffConfig).playoffConfig;
  const initial: DivisionForm = {
    name: division.name,
    tier: division.tier ?? "",
    genderEligibility: division.genderEligibility,
    maxTeams: s(division.maxTeams),
    regionId: division.regionId ?? "",
    ageMin: s(rules.ageRange?.min),
    ageMax: s(rules.ageRange?.max),
    ageLabel: rules.ageRange?.label ?? "",
    numberOfPeriods: s(rules.gameRules?.numberOfPeriods),
    periodLengthMin: s(rules.gameRules?.periodLengthMin),
    maxRosterSize: s(rules.gameRules?.maxRosterSize),
    points: pointsRuleForm((division.ruleSetOverrides as { pointsRule?: unknown } | null)?.pointsRule),
    playoffSpots: playoffs.playoffSpots,
    playoffOvertimeRule: playoffs.overtimeRule ?? ""
  };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<DivisionForm>(initial);
  const { busy, error, setError, run } = useSave();
  return (
    <>
      <Trigger label="Edit division" icon="edit" onClick={() => { setF(initial); setError(null); setOpen(true); }} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit division" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const p = divisionProblem(f);
            if (p) return setError(p);
            void run(
              () =>
                save({
                  name: f.name.trim(),
                  tier: f.tier || null,
                  regionId: f.regionId || null,
                  genderEligibility: f.genderEligibility,
                  maxTeams: num(f.maxTeams),
                  ruleSetOverrides: mergedRules((division.ruleSetOverrides ?? {}) as Record<string, unknown>, f),
                  // Only the spots change; every other stored playoff key is kept.
                  ...(playoffs.enabled
                    ? { playoffConfig: { ...((division.playoffConfig ?? {}) as Record<string, unknown>), playoffSpots: f.playoffSpots, overtimeRule: f.playoffOvertimeRule || null } }
                    : {})
                }),
              () => setOpen(false)
            );
          }}
        >
          <DivisionFields f={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} playoffsOn={playoffs.enabled} regions={regions} />
          <p className="text-[12px] text-fg-muted">
            Tiebreaker order and {playoffs.enabled ? "the other playoff settings" : "playoff settings"} are kept as they are (set in org setup). Standings use the points the next time a game is finalized.
          </p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Save division" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

// ---------- team ----------

export interface TeamUpdateBody {
  name?: string;
  shortName?: string | null;
  logoUrl?: string | null;
  colors?: Record<string, unknown>;
  homeRink?: string | null;
  confirmationThresholdCents?: number;
}

/**
 * Edit a team's identity, branding and confirmation threshold (SETUP-2).
 * Same fields and labels as New team. Sport, organization and captain are
 * not edited here (captain has its own panel on the team page).
 */
export function EditTeamButton({
  team,
  save
}: {
  team: Team;
  save: (body: TeamUpdateBody) => Promise<unknown>;
}) {
  const colors = (team.colors ?? {}) as { primary?: string; secondary?: string };
  const [open, setOpen] = useState(false);
  const { busy, error, setError, run } = useSave();
  const [f, setF] = useState({
    name: team.name,
    shortName: team.shortName ?? "",
    homeRink: team.homeRink ?? "",
    logoUrl: team.logoUrl ?? "",
    primary: colors.primary ?? "#3B82F6",
    secondary: colors.secondary ?? "#FFFFFF",
    threshold: String(Math.round((team.confirmationThresholdCents ?? 0) / 100))
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <>
      <Trigger label="Edit team" icon="edit" onClick={() => setOpen(true)} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit team" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const dollars = Number(f.threshold || "0");
            if (!Number.isInteger(dollars) || dollars < 0) return setError("Threshold is whole dollars, 0 or more.");
            void run(
              () =>
                save({
                  name: f.name.trim(),
                  shortName: f.shortName.trim() || null,
                  homeRink: f.homeRink.trim() || null,
                  logoUrl: f.logoUrl.trim() || null,
                  // Keep colour keys the form does not edit.
                  colors: { ...colors, primary: f.primary, secondary: f.secondary },
                  confirmationThresholdCents: dollars * 100
                }),
              () => setOpen(false)
            );
          }}
        >
          <Field label="Team name">
            <Input required maxLength={120} value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Short name" hint="Max 6 chars.">
              <Input maxLength={6} value={f.shortName} onChange={(e) => set("shortName", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Home rink" hint="Optional. Used by the scheduler.">
              <Input value={f.homeRink} onChange={(e) => set("homeRink", e.target.value)} />
            </Field>
          </div>
          <Field label="Logo URL" hint="Optional">
            <Input type="url" value={f.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Primary colour">
              <Input type="color" value={f.primary} onChange={(e) => set("primary", e.target.value)} />
            </Field>
            <Field label="Secondary colour">
              <Input type="color" value={f.secondary} onChange={(e) => set("secondary", e.target.value)} />
            </Field>
          </div>
          <Field label="Confirmation threshold (USD)" hint="Whole dollars. Deposits needed before a division entry confirms. 0 confirms on approval.">
            <Input type="number" min={0} step={1} value={f.threshold} onChange={(e) => set("threshold", e.target.value)} />
          </Field>
          <p className="text-[12px] text-fg-muted">Sport and organization are fixed once the team exists. Change the captain below.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Actions busy={busy} label="Save team" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

/** Row of header actions for the detail pages' `actions` slot. */
export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
