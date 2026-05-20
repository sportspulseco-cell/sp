"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@sportspulse/ui";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import {
  DEFAULT_TIEBREAKERS,
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

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Organisation",
  2: "League",
  3: "Season",
  4: "Divisions"
};

const STEP_HEADLINES: Record<WizardStep, string> = {
  1: "Pick the organisation.",
  2: "Frame the league.",
  3: "Open the season.",
  4: "Carve the divisions."
};

const STEP_SUBTITLES: Record<WizardStep, string> = {
  1: "Every league nests under exactly one organisation. Pick the tenant this whole setup belongs to.",
  2: "Sport, format, governing body, branding, privacy. The league frame everything else hangs from.",
  3: "Dates, registration window, roster lock. The clock that drives the rest of the year.",
  4: "Skill tiers, age ranges, gender eligibility, rule overrides. Every team plays inside one of these."
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
  changeLeagueStatus,
  onComplete
}: {
  /** Pre-filtered to the orgs the caller is allowed to write to. */
  orgs: Org[];
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
    genderEligibility: "open" | "male" | "female" | "mixed";
    maxTeams: number;
    ruleSetOverrides: Record<string, unknown>;
    playoffConfig: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  changeLeagueStatus: (leagueId: string, status: string) => Promise<unknown>;
  /** Called after a successful run. Consuming app decides where to send the admin. */
  onComplete: (result: { leagueId: string }) => void;
}) {
  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    // Auto-select when there's only one option (org-admin case).
    orgId: orgs.length === 1 ? orgs[0]!.id : null,
    league: defaultLeagueDraft(sports[0]?.code ?? ""),
    season: defaultSeasonDraft(),
    divisions: [emptyDivision(crypto.randomUUID())]
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const currentOrg = useMemo(
    () => orgs.find((o) => o.id === state.orgId) ?? null,
    [orgs, state.orgId]
  );

  const stepValidation = useMemo(() => {
    // Local-date today (YYYY-MM-DD) so we can compare against <input type="date">
    // values without timezone weirdness.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const isFutureOrToday = (d: string) => !!d && d >= today;
    return {
      1: !!state.orgId,
      2:
        state.league.name.trim().length > 0 &&
        state.league.slug.trim().length > 0 &&
        !!state.league.sportCode &&
        !!state.league.format &&
        !!state.league.timezone,
      3:
        state.season.name.trim().length > 0 &&
        isFutureOrToday(state.season.startDate) &&
        isFutureOrToday(state.season.endDate) &&
        state.season.endDate >= state.season.startDate &&
        isFutureOrToday(state.season.registrationOpensAt) &&
        isFutureOrToday(state.season.registrationClosesAt) &&
        state.season.registrationClosesAt >= state.season.registrationOpensAt &&
        (!state.season.rosterLockAt || state.season.rosterLockAt >= today),
      4:
        state.divisions.length > 0 &&
        state.divisions.every((d) => d.name.trim().length > 0)
    } as Record<WizardStep, boolean>;
  }, [state]);

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
      setError("Some steps are incomplete — go back and finish them first.");
      return;
    }
    if (!state.orgId) return;
    setBusy(true);
    setError(null);
    try {
      const league = await createLeague({
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

      const season = await createSeason({
        leagueId: league.id,
        name: state.season.name,
        sportCode: state.league.sportCode,
        startDate: state.season.startDate,
        endDate: state.season.endDate,
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

      for (const d of state.divisions) {
        await createDivision({
          seasonId: season.id,
          name: d.name,
          tier: d.tier,
          ageGroupId: d.ageGroupId,
          genderEligibility:
            d.genderEligibility === "open"
              ? "open"
              : (d.genderEligibility as "male" | "female" | "mixed"),
          maxTeams: d.maxTeams,
          ruleSetOverrides: {
            gameRules: d.gameRules,
            tiebreakers: d.tiebreakers,
            ageRange: {
              min: d.ageRangeMin,
              max: d.ageRangeMax,
              label: d.ageGroupLabel
            }
          },
          playoffConfig: d.playoffConfig as unknown as Record<string, unknown>
        });
      }

      if (publish) {
        await changeLeagueStatus(league.id, "active");
      }

      onComplete({ leagueId: league.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="relative pb-6">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[--accent]/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[--accent]" />
          </span>
          <span className="text-fg/80">// org · setup</span>
          <span className="text-fg-subtle">·</span>
          <span>chapter {String(state.step).padStart(2, "0")} / 04</span>
        </motion.div>
        <motion.h1
          key={state.step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.05,
            ease: [0.22, 1, 0.36, 1]
          }}
          className="mt-3 max-w-[24ch] text-balance font-sans text-[clamp(32px,4.4vw,56px)] font-semibold leading-[0.96] tracking-tighter text-fg"
        >
          {STEP_HEADLINES[state.step]}
        </motion.h1>
        <motion.p
          key={`sub-${state.step}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.1,
            ease: [0.22, 1, 0.36, 1]
          }}
          className="mt-3 max-w-2xl text-[14px] leading-relaxed text-fg-muted"
        >
          {STEP_SUBTITLES[state.step]}
        </motion.p>
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

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <motion.div
        key={`step-${state.step}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {state.step === 1 ? (
          <OrgStep
            orgs={orgs}
            selectedId={state.orgId}
            onSelect={(id) => setState((s) => ({ ...s, orgId: id }))}
          />
        ) : null}
        {state.step === 2 ? (
          <LeagueStep
            draft={state.league}
            org={currentOrg}
            sports={sports}
            governingBodies={governingBodies}
            onChange={patchLeague}
          />
        ) : null}
        {state.step === 3 ? (
          <SeasonStep
            draft={state.season}
            leagueName={state.league.name}
            onChange={patchSeason}
          />
        ) : null}
        {state.step === 4 ? (
          <DivisionsStep
            divisions={state.divisions}
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
