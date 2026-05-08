"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Send } from "lucide-react";
import { Button } from "@sportspulse/ui";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import { admin, leagueMgmt } from "@/lib/api/browser-api";
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
    // Pre-select whatever the seeded sports table actually has — using a
    // hard-coded "ice_hockey" would FK-fail on insert because the seed
    // uses HOCKEY_ICE. Empty string falls through to "pick a sport".
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

export function OrgSetupWizard({
  orgs,
  sports,
  governingBodies
}: {
  orgs: Org[];
  sports: Sport[];
  governingBodies: GoverningBody[];
}) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    orgId: null,
    league: defaultLeagueDraft(sports[0]?.code ?? ""),
    season: defaultSeasonDraft(),
    divisions: [emptyDivision(crypto.randomUUID())]
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill slug + season name + season sport from earlier picks.
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
        !!state.season.startDate &&
        !!state.season.endDate &&
        !!state.season.registrationOpensAt &&
        !!state.season.registrationClosesAt,
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
    if (!stepValidation[1] || !stepValidation[2] || !stepValidation[3] || !stepValidation[4]) {
      setError("Some steps are incomplete — go back and finish them first.");
      return;
    }
    if (!state.orgId) return;
    setBusy(true);
    setError(null);
    try {
      // 1. League
      const league = await leagueMgmt.createLeague({
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

      // 2. Season
      const season = await leagueMgmt.createSeason({
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

      // 3. Divisions
      for (const d of state.divisions) {
        await leagueMgmt.createDivision({
          seasonId: season.id,
          name: d.name,
          tier: d.tier,
          ageGroupId: d.ageGroupId,
          genderEligibility: d.genderEligibility === "open" ? "open" : (d.genderEligibility as "male" | "female" | "mixed"),
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

      // 4. Publish (optional) — flips league status from draft to active.
      if (publish) {
        await leagueMgmt.changeLeagueStatus(league.id, "active");
      }

      router.push(`/leagues/${league.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
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
