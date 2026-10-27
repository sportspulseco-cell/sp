"use client";

import { PointsRuleFields, pointsRuleForm, pointsRuleFromForm, type PointsRuleForm } from "../divisions/points-rule-fields";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Alert, Button, Dialog, DialogActions, Field, Input, Select } from "@sportspulse/ui";
import type { Division, GoverningBody, League, Org, Season, Team } from "@sportspulse/api-client";
import { FORMATS, PRIVACY_OPTIONS, TIMEZONES } from "../org-setup/steps/league-step";
import { GENDERS, TIERS } from "../org-setup/steps/division-card";
import { DEFAULT_TIEBREAKERS, emptyDivision } from "../org-setup/types";
import { readDisciplineRules, validateDisciplineRules, type DisciplineRules } from "@sportspulse/kernel";

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
/** ISO timestamp -> local YYYY-MM-DD for <input type="date">. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Same conversion the Org setup wizard uses for registration timestamps. */
const startOfDay = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const endOfDay = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);

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

function toSeasonBody(f: SeasonForm) {
  return {
    name: f.name.trim(),
    startDate: f.startDate,
    endDate: f.endDate,
    playoffStartDate: f.playoffStartDate || null,
    playoffEndDate: f.playoffEndDate || null,
    registrationOpensAt: startOfDay(f.registrationOpensAt),
    registrationClosesAt: endOfDay(f.registrationClosesAt),
    rosterLockAt: endOfDay(f.rosterLockAt)
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
              () => create({ ...toSeasonBody(f), leagueId: league.id, sportCode: league.sportCode, timezone: tz }),
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
  const initial: SeasonForm = {
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    playoffStartDate: season.playoffStartDate ?? "",
    playoffEndDate: season.playoffEndDate ?? "",
    registrationOpensAt: toDateInput(season.registrationOpensAt),
    registrationClosesAt: toDateInput(season.registrationClosesAt),
    rosterLockAt: toDateInput(season.rosterLockAt)
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
            void run(() => save(toSeasonBody(f)), () => setOpen(false));
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
};

function DivisionFields({
  f,
  set,
  setPoints,
  regions
}: {
  f: DivisionForm;
  set: (k: Exclude<keyof DivisionForm, "points">, v: string) => void;
  setPoints: (next: PointsRuleForm) => void;
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
          <Select value={f.genderEligibility} onChange={(e) => set("genderEligibility", e.target.value)}>
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
      <PointsRuleFields value={f.points} onChange={(next) => setPoints(next)} />
    </>
  );
}

function divisionProblem(f: DivisionForm): string | null {
  if (!f.name.trim()) return "Division name is required.";
  if (f.maxTeams && Number(f.maxTeams) < 2) return "Max teams must be at least 2.";
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

export function NewDivisionButton({
  season,
  regions,
  create
}: {
  season: Season;
  regions: Array<{ id: string; name: string }>;
  create: (body: DivisionCreateBody) => Promise<unknown>;
}) {
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
    points: pointsRuleForm(null)
  };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<DivisionForm>(empty);
  const { busy, error, setError, run } = useSave();
  return (
    <>
      <Trigger label="New division" icon="add" onClick={() => { setF(empty); setError(null); setOpen(true); }} />
      <Dialog open={open} onClose={() => setOpen(false)} title={`New division in ${season.name}`} size="lg">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
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
                    { gameRules: d.gameRules, tiebreakers: DEFAULT_TIEBREAKERS },
                    f
                  ),
                  playoffConfig: d.playoffConfig as unknown as Record<string, unknown>
                }),
              () => setOpen(false)
            );
          }}
        >
          <DivisionFields f={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} setPoints={(points) => setF((p) => ({ ...p, points }))} regions={regions} />
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
    points: pointsRuleForm((division.ruleSetOverrides as { pointsRule?: unknown } | null)?.pointsRule)
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
                  ruleSetOverrides: mergedRules((division.ruleSetOverrides ?? {}) as Record<string, unknown>, f)
                }),
              () => setOpen(false)
            );
          }}
        >
          <DivisionFields f={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} setPoints={(points) => setF((p) => ({ ...p, points }))} regions={regions} />
          <p className="text-[12px] text-fg-muted">Tiebreaker order and playoff settings are kept as they are (set in org setup). Standings use the points the next time a game is finalized.</p>
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
