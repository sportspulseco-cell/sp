"use client";

import { pointsRuleForm, pointsRuleFromForm } from "../divisions/points-rule-fields";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { motion } from "framer-motion";
import { Alert, Button } from "@sportspulse/ui";
import type { GoverningBody, League, Org, Season, Sport } from "@sportspulse/api-client";
import {
  DEFAULT_TIEBREAKERS,
  NEW_REGION,
  emptyDivision,
  slugify,
  type DivisionDraft,
  type LeagueDraft,
  type SeasonDraft,
  type WizardState,
  type WizardStep
} from "./types";
import { ProgressBar } from "./progress-bar";
import { OrgStep } from "./steps/org-step";
import { LeagueStep } from "./steps/league-step";
import { SeasonStep } from "./steps/season-step";
import { DivisionsStep } from "./steps/divisions-step";
import { ExistingChoice } from "./steps/existing-choice";

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Organization",
  2: "League",
  3: "Season",
  4: "Divisions"
};

const STEP_HEADLINES: Record<WizardStep, string> = {
  1: "Which organization?",
  2: "Which league?",
  3: "Which season?",
  4: "Add divisions"
};

const STEP_NEXT_LABEL: Record<WizardStep, string> = {
  1: "Next: League",
  2: "Next: Season",
  3: "Next: Divisions",
  4: "Publish"
};

function defaultLeagueDraft(firstSportCode: string): LeagueDraft {
  return {
    name: "",
    slug: "",
    sportCode: firstSportCode,
    format: "regular",
    governingBodyId: null,
    timezone: "America/New_York",
    branding: { logoUrl: null, primaryColor: "#3B82F6" },
    privacy: "public"
  };
}

function defaultSeasonDraft(): SeasonDraft {
  return {
    name: "",
    startDate: "",
    endDate: "",
    playoffStartDate: "",
    playoffEndDate: "",
    registrationOpensAt: "",
    registrationClosesAt: "",
    rosterLockAt: ""
  };
}

/**
 * Shared 4-phase Org Setup wizard. Pure presentational + state —
 * transport is injected via callback props so the same component
 * mounts in sa-web (with its full-scope browser-api bindings) and
 * org-admin-web (with org-scoped proxy bindings), no parallel
 * implementations.
 *
 * Per CLAUDE.md cardinal rule: reuse over silos. Per repo owner
 * 2026-05-19: org-admin's wizard should lock step 1 to the user's
 * own orgs, and `onComplete` lets the consuming app push to its
 * own /leagues/[id] route (no relative URLs that would route to
 * the confidential sp-superadmin URL).
 */
export function OrgSetupWizard({
  orgs,
  sports,
  governingBodies,
  createLeague,
  createSeason,
  createDivision,
  listRegions,
  createRegion,
  changeLeagueStatus,
  onComplete,
  orgSports = {},
  renderCreateOrg,
  listLeagues,
  listSeasons
}: {
  /** Pre-filtered to the orgs the caller is allowed to write to. */
  orgs: Org[];
  /** Sport each org already plays (see sportByOrg); drives the default. */
  orgSports?: Record<string, string>;
  sports: Sport[];
  governingBodies: GoverningBody[];
  createLeague: (input: {
    orgId: string;
    sportCode: string;
    name: string;
    format: string;
    governingBodyId: string | null;
    metadata: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  createSeason: (input: {
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
  }) => Promise<{ id: string }>;
  createDivision: (input: {
    seasonId: string;
    name: string;
    tier: string | null;
    ageGroupId: string | null;
    /** Region of the org (Season -> Region -> Division), or null. */
    regionId: string | null;
    genderEligibility: "open" | "male" | "female" | "mixed";
    maxTeams: number;
    ruleSetOverrides: Record<string, unknown>;
    playoffConfig: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  /** Active regions of an org, for the division region picker. */
  listRegions: (orgId: string) => Promise<Array<{ id: string; name: string }>>;
  /** Creates a region typed inline in the division card. */
  createRegion: (input: { orgId: string; name: string }) => Promise<{ id: string; name: string }>;
  changeLeagueStatus: (leagueId: string, status: string) => Promise<unknown>;
  /** Called after a successful run. Consuming app decides where to send the admin. */
  onComplete: (result: { leagueId: string }) => void;
  /**
   * Step 1 "New organization" (super admin only). The app renders its own
   * create form + org-admin picker and calls `onCreated` with the new org.
   * Omitted (org-admin console) = no create option.
   */
  renderCreateOrg?: (onCreated: (org: Org) => void, onCancel: () => void) => ReactNode;
  /** Leagues of an org, so step 2 can add to an existing league. */
  listLeagues?: (orgId: string) => Promise<League[]>;
  /** Seasons of a league, so step 3 can add divisions to an existing season. */
  listSeasons?: (leagueId: string) => Promise<Season[]>;
}) {
  // Orgs created in step 1 join the list without a page reload.
  const [orgList, setOrgList] = useState<Org[]>(orgs);
  // Step 2 / 3 "use existing" choices (SP-Changes item 2). Null = create new.
  const [existingLeague, setExistingLeague] = useState<League | null>(null);
  const [existingSeason, setExistingSeason] = useState<Season | null>(null);
  const [orgLeagues, setOrgLeagues] = useState<League[]>([]);
  const [leagueSeasons, setLeagueSeasons] = useState<Season[]>([]);
  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    // Auto-select when there's only one option (org-admin case).
    orgId: orgs.length === 1 ? orgs[0]!.id : null,
    league: defaultLeagueDraft(
      orgs.length === 1 ? orgSports[orgs[0]!.id] ?? "" : ""
    ),
    season: defaultSeasonDraft(),
    divisions: [emptyDivision(crypto.randomUUID())]
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the current submit run has saved so far (see submit()).
  const progress = useRef<{
    leagueId?: string;
    leagueName?: string;
    seasonId?: string;
    divisionUids: Set<string>;
  }>({ divisionUids: new Set() });
  // What was saved for one organization / league choice must not be
  // reused for another.
  useEffect(() => {
    progress.current = { divisionUids: new Set() };
  }, [state.orgId, existingLeague?.id, existingSeason?.id]);
  // Regions belong to the org picked in step 1; reload when it changes.
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    if (!state.orgId) {
      setRegions([]);
      return;
    }
    listRegions(state.orgId)
      .then((r) => {
        if (!cancelled) setRegions(r);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orgId]);

  function patchLeague(patch: Partial<LeagueDraft>) {
    setState((s) => {
      const next = { ...s.league, ...patch };
      if (patch.name !== undefined && !s.league.slug) {
        next.slug = slugify(patch.name);
      }
      return { ...s, league: next };
    });
  }
  function patchSeason(patch: Partial<SeasonDraft>) {
    setState((s) => ({ ...s, season: { ...s.season, ...patch } }));
  }
  function patchDivision(uid: string, patch: Partial<DivisionDraft>) {
    setState((s) => ({
      ...s,
      divisions: s.divisions.map((d) =>
        d.uid === uid ? { ...d, ...patch } : d
      )
    }));
  }
  function addDivision() {
    setState((s) => ({
      ...s,
      divisions: [...s.divisions, emptyDivision(crypto.randomUUID())]
    }));
  }
  function removeDivision(uid: string) {
    setState((s) => ({
      ...s,
      divisions:
        s.divisions.length === 1
          ? s.divisions
          : s.divisions.filter((d) => d.uid !== uid)
    }));
  }

  // Leagues of the chosen org (step 2 "existing league" option).
  useEffect(() => {
    let cancelled = false;
    setExistingLeague(null);
    setExistingSeason(null);
    if (!state.orgId || !listLeagues) {
      setOrgLeagues([]);
      return;
    }
    listLeagues(state.orgId)
      .then((l) => {
        if (!cancelled) setOrgLeagues(l.filter((x) => x.status !== "archived"));
      })
      .catch(() => {
        if (!cancelled) setOrgLeagues([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orgId]);

  function pickLeague(id: string | null) {
    const l = id ? orgLeagues.find((x) => x.id === id) ?? null : null;
    setExistingLeague(l);
    setExistingSeason(null);
    setLeagueSeasons([]);
    if (!l) return;
    // Mirror the league into the draft so the review summary reads right.
    const md = (l.metadata ?? {}) as { slug?: string; timezone?: string; privacy?: LeagueDraft["privacy"] };
    setState((st) => ({
      ...st,
      league: {
        ...st.league,
        name: l.name,
        slug: md.slug ?? st.league.slug,
        sportCode: l.sportCode,
        format: l.format as LeagueDraft["format"],
        governingBodyId: l.governingBodyId,
        timezone: md.timezone ?? st.league.timezone,
        privacy: md.privacy ?? st.league.privacy
      }
    }));
    if (listSeasons) {
      listSeasons(l.id)
        .then((x) => setLeagueSeasons(x.filter((y) => y.status !== "completed" && y.status !== "archived")))
        .catch(() => setLeagueSeasons([]));
    }
  }

  function pickSeason(id: string | null) {
    const x = id ? leagueSeasons.find((y) => y.id === id) ?? null : null;
    setExistingSeason(x);
    if (!x) return;
    const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
    setState((st) => ({
      ...st,
      season: {
        ...st.season,
        name: x.name,
        startDate: x.startDate,
        endDate: x.endDate,
        playoffStartDate: x.playoffStartDate ?? "",
        playoffEndDate: x.playoffEndDate ?? "",
        registrationOpensAt: day(x.registrationOpensAt),
        registrationClosesAt: day(x.registrationClosesAt),
        rosterLockAt: day(x.rosterLockAt)
      }
    }));
  }

  const currentOrg = useMemo(
    () => orgList.find((o) => o.id === state.orgId) ?? null,
    [orgList, state.orgId]
  );

  // Same rule as the API: one live league per name in an org, ignoring case.
  const leagueNameTaken =
    !existingLeague &&
    state.league.name.trim().length > 0 &&
    orgLeagues.some((l) => l.name.trim().toLowerCase() === state.league.name.trim().toLowerCase());

  const stepValidation = useMemo(() => {
    // Local-date today (YYYY-MM-DD) so we can compare against <input type="date">
    // values without timezone weirdness.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const isFutureOrToday = (d: string) => !!d && d >= today;
    return {
      1: !!state.orgId,
      2:
        !!existingLeague ||
        (state.league.name.trim().length > 0 &&
          !leagueNameTaken &&
          state.league.slug.trim().length > 0 &&
          !!state.league.sportCode &&
          !!state.league.format &&
          !!state.league.timezone),
      3: (() => {
        if (existingSeason) return true;
        const s = state.season;
        if (s.name.trim().length === 0) return false;
        if (!isFutureOrToday(s.startDate)) return false;
        if (!isFutureOrToday(s.endDate)) return false;
        if (s.endDate < s.startDate) return false;
        if (!isFutureOrToday(s.registrationOpensAt)) return false;
        if (!isFutureOrToday(s.registrationClosesAt)) return false;
        if (s.registrationClosesAt < s.registrationOpensAt) return false;
        if (s.rosterLockAt && s.rosterLockAt < today) return false;
        // Playoff dates are optional, but if one is set, both must be
        // set and they must sit inside the season window with start <=
        // end. The day before playoffStartDate is the implicit
        // "regular season finale", so we don't ask the admin for a
        // separate finale date.
        const hasAnyPlayoff = !!s.playoffStartDate || !!s.playoffEndDate;
        if (hasAnyPlayoff) {
          if (!s.playoffStartDate || !s.playoffEndDate) return false;
          if (s.playoffStartDate < s.startDate) return false;
          if (s.playoffEndDate > s.endDate) return false;
          if (s.playoffEndDate < s.playoffStartDate) return false;
        }
        return true;
      })(),
      4:
        state.divisions.length > 0 &&
        state.divisions.every(
          (d) =>
            d.name.trim().length > 0 &&
            (d.regionId !== NEW_REGION || d.regionName.trim().length > 0)
        )
    } as Record<WizardStep, boolean>;
  }, [state, existingLeague, existingSeason, leagueNameTaken]);

  function goNext() {
    if (!stepValidation[state.step]) return;
    if (state.step < 4) {
      setState((s) => ({ ...s, step: (s.step + 1) as WizardStep }));
    }
  }
  function goBack() {
    if (state.step > 1) {
      setState((s) => ({ ...s, step: (s.step - 1) as WizardStep }));
    }
  }

  async function submit({ publish }: { publish: boolean }) {
    if (
      !stepValidation[1] ||
      !stepValidation[2] ||
      !stepValidation[3] ||
      !stepValidation[4]
    ) {
      setError("Some steps are incomplete. Go back and finish them first.");
      return;
    }
    if (!state.orgId) return;
    setBusy(true);
    setError(null);
    // The steps run one request at a time. A failure part-way used to
    // leave the league behind and the next click created a second empty
    // one (PPHL, 24 Oct 2026). Remember what this run already saved, say
    // which step failed, and resume from there on the next click.
    const saved = progress.current;
    let stepLabel = "league";
    try {
      // Existing league / season chosen in steps 2-3: reuse, create nothing.
      if (existingLeague) {
        saved.leagueId = existingLeague.id;
        saved.leagueName = existingLeague.name;
      } else if (!saved.leagueId) {
        const created = await createLeague({
          orgId: state.orgId,
          sportCode: state.league.sportCode,
          name: state.league.name,
          format: state.league.format,
          governingBodyId: state.league.governingBodyId,
          metadata: {
            slug: state.league.slug,
            branding: state.league.branding,
            privacy: state.league.privacy,
            timezone: state.league.timezone
          }
        });
        saved.leagueId = created.id;
        saved.leagueName = state.league.name;
      }
      const league = { id: saved.leagueId };

      stepLabel = "season";
      const season = existingSeason
        ? existingSeason
        : saved.seasonId
          ? { id: saved.seasonId }
          : await createSeason({
        leagueId: league.id,
        name: state.season.name,
        sportCode: state.league.sportCode,
        startDate: state.season.startDate,
        endDate: state.season.endDate,
        playoffStartDate: state.season.playoffStartDate || null,
        playoffEndDate: state.season.playoffEndDate || null,
        timezone: state.league.timezone,
        registrationOpensAt: state.season.registrationOpensAt
          ? new Date(state.season.registrationOpensAt + "T00:00:00").toISOString()
          : null,
        registrationClosesAt: state.season.registrationClosesAt
          ? new Date(state.season.registrationClosesAt + "T23:59:59").toISOString()
          : null,
        rosterLockAt: state.season.rosterLockAt
          ? new Date(state.season.rosterLockAt + "T23:59:59").toISOString()
          : null
      });
      saved.seasonId = season.id;

      stepLabel = "regions";
      // Regions typed inline: create each distinct new name once (case-
      // insensitive), reusing an existing region when the name matches.
      const regionIdByName = new Map(regions.map((r) => [r.name.toLowerCase(), r.id]));
      const resolvedRegion = new Map<string, string | null>();
      for (const d of state.divisions) {
        if (d.regionId !== NEW_REGION) {
          resolvedRegion.set(d.uid, d.regionId);
          continue;
        }
        const name = d.regionName.trim();
        const key = name.toLowerCase();
        let id = regionIdByName.get(key);
        if (!id) {
          const created = await createRegion({ orgId: state.orgId, name });
          id = created.id;
          regionIdByName.set(key, id);
        }
        resolvedRegion.set(d.uid, id);
      }

      for (const d of state.divisions) {
        if (saved.divisionUids.has(d.uid)) continue;
        stepLabel = `division "${d.name}"`;
        await createDivision({
          seasonId: season.id,
          name: d.name,
          tier: d.tier,
          ageGroupId: d.ageGroupId,
          regionId: resolvedRegion.get(d.uid) ?? null,
          genderEligibility:
            d.genderEligibility === "open"
              ? "open"
              : (d.genderEligibility as "male" | "female" | "mixed"),
          maxTeams: d.maxTeams,
          ruleSetOverrides: {
            gameRules: d.gameRules,
            tiebreakers: d.tiebreakers,
            ...(() => {
              const pts = pointsRuleFromForm(d.points ?? pointsRuleForm(null));
              return "rule" in pts ? { pointsRule: pts.rule } : {};
            })(),
            ageRange: {
              min: d.ageRangeMin,
              max: d.ageRangeMax,
              label: d.ageGroupLabel
            }
          },
          playoffConfig: d.playoffConfig as unknown as Record<string, unknown>
        });
        saved.divisionUids.add(d.uid);
      }

      if (publish && existingLeague?.status !== "active") {
        stepLabel = "publish";
        await changeLeagueStatus(league.id, "active");
      }

      progress.current = { divisionUids: new Set() };
      onComplete({ leagueId: league.id });
    } catch (err) {
      const done = [
        saved.leagueId ? `league "${saved.leagueName}"` : null,
        saved.seasonId ? "season" : null,
        saved.divisionUids.size ? `${saved.divisionUids.size} division(s)` : null
      ].filter(Boolean);
      setError(
        `Could not save the ${stepLabel}: ${(err as Error).message}` +
          (done.length
            ? ` Already saved: ${done.join(", ")}. Fix the problem and click again; saving continues from the ${stepLabel} and nothing is created twice.`
            : "")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="relative pb-5">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2 text-[13px] text-fg-muted"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[--accent]/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[--accent]" />
          </span>
          <span>Set up a season · step {state.step} of 4</span>
        </motion.div>
        <motion.h1
          key={state.step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-2 max-w-[24ch] text-balance font-sans text-[clamp(24px,3vw,30px)] font-semibold leading-tight tracking-tight text-fg"
        >
          {STEP_HEADLINES[state.step]}
        </motion.h1>
        <div className="absolute inset-x-0 bottom-0 flex items-center">
          <span className="h-px w-6 bg-[--accent]" />
          <span className="h-px flex-1 bg-border" />
        </div>
      </header>

      <ProgressBar
        step={state.step}
        labels={STEP_LABELS}
        validation={stepValidation}
        onNavigate={(s) => setState((p) => ({ ...p, step: s }))}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <motion.div
        key={`step-${state.step}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {state.step === 1 ? (
          <OrgStep
            orgs={orgList}
            renderCreateOrg={
              renderCreateOrg
                ? (close) =>
                    renderCreateOrg((org) => {
                      setOrgList((l) => [org, ...l.filter((o) => o.id !== org.id)]);
                      setState((st) => ({ ...st, orgId: org.id }));
                      close();
                    }, close)
                : undefined
            }
            selectedId={state.orgId}
            onSelect={(id) =>
              setState((s) => ({
                ...s,
                orgId: id,
                // Follow the org's sport until the admin picks one.
                league: s.league.sportCode
                  ? s.league
                  : { ...s.league, sportCode: orgSports[id] ?? "" }
              }))
            }
          />
        ) : null}
        {state.step === 2 ? (
          <div className="space-y-6">
            {orgLeagues.length > 0 ? (
              <ExistingChoice
                newLabel="Create a new league"
                existingLabel="Add to an existing league"
                pickLabel="League"
                items={orgLeagues.map((l) => ({ id: l.id, name: l.name }))}
                selectedId={existingLeague?.id ?? null}
                onPick={(id) => pickLeague(id)}
              />
            ) : null}
            {existingLeague ? null : (
              <LeagueStep
                draft={state.league}
                org={currentOrg}
                sports={sports}
                governingBodies={governingBodies}
                onChange={patchLeague}
                nameTaken={leagueNameTaken}
              />
            )}
          </div>
        ) : null}
        {state.step === 3 ? (
          <div className="space-y-6">
            {existingLeague && leagueSeasons.length > 0 ? (
              <ExistingChoice
                newLabel="Create a new season"
                existingLabel="Add divisions to an existing season"
                pickLabel="Season"
                items={leagueSeasons.map((x) => ({
                  id: x.id,
                  name: `${x.name} (${x.status.replace(/_/g, " ")})`
                }))}
                selectedId={existingSeason?.id ?? null}
                onPick={(id) => pickSeason(id)}
              />
            ) : null}
            {existingSeason ? null : (
              <SeasonStep
                draft={state.season}
                leagueName={state.league.name}
                onChange={patchSeason}
              />
            )}
          </div>
        ) : null}
        {state.step === 4 ? (
          <DivisionsStep
            divisions={state.divisions}
            regions={regions}
            summary={{
              league: state.league,
              season: state.season,
              org: currentOrg
            }}
            onPatch={patchDivision}
            onAdd={addDivision}
            onRemove={removeDivision}
          />
        ) : null}
      </motion.div>

      <Footer
        step={state.step}
        canAdvance={stepValidation[state.step]}
        busy={busy}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={() => submit({ publish: false })}
        onPublish={() => submit({ publish: true })}
        nextLabel={STEP_NEXT_LABEL[state.step]}
      />
    </div>
  );
}

function Footer({
  step,
  canAdvance,
  busy,
  onBack,
  onNext,
  onSaveDraft,
  onPublish,
  nextLabel
}: {
  step: WizardStep;
  canAdvance: boolean;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  nextLabel: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/90 px-6 py-3 backdrop-blur">
      {step > 1 ? (
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-mono text-[10px] uppercase tracking-widest">Back</span>
        </Button>
      ) : (
        <span />
      )}
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Step {step} of 4
      </p>
      {step < 4 ? (
        <Button type="button" onClick={onNext} disabled={!canAdvance || busy}>
          <span className="font-mono text-[10px] uppercase tracking-widest">{nextLabel}</span>
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveDraft}
            disabled={!canAdvance || busy}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-widest">Save draft</span>
          </Button>
          <Button
            type="button"
            onClick={onPublish}
            disabled={!canAdvance || busy}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest">Publish league</span>
          </Button>
        </div>
      )}
    </div>
  );
}
