"use client";

import { pointsRuleForm, pointsRuleFromForm } from "../divisions/points-rule-fields";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { SetupPreview } from "./setup-preview";
import styles from "./setup-workspace.module.css";
import { Alert, Button } from "@sportspulse/ui";
import { calendarDateInZone, endOfDayInZone, startOfDayInZone, statusLabel, guidedRegistrationProblem, type GuidedRegistrationSetupInput } from "@sportspulse/kernel";
import type { GoverningBody, League, Org, Season, Sport } from "@sportspulse/api-client";
import {
  DEFAULT_TIEBREAKERS,
  NEW_REGION,
  copyDivisionDraft,
  divisionDraftProblem,
  seasonDraftChecks,
  type SeasonPanel,
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
import type { UploadLogo } from "./steps/logo-upload";
import { SeasonStep } from "./steps/season-step";
import { DivisionsStep } from "./steps/divisions-step";
import { ExistingChoice } from "./steps/existing-choice";
import { RegistrationStep, RegistrationReview, defaultRegistrationDraft, registrationSetupInput, type RegistrationDraft } from "./steps/registration-step";

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Organization",
  2: "League",
  3: "Season",
  4: "Divisions", 5: "Registration", 6: "Review"
};

const STEP_HEADLINES: Record<WizardStep, string> = {
  1: "Which organization?",
  2: "Which league?",
  3: "Which season?",
  4: "Add divisions", 5: "Set up registration", 6: "Review and publish"
};

const STEP_NEXT_LABEL: Record<WizardStep, string> = {
  1: "Next: League",
  2: "Next: Season",
  3: "Next: Divisions",
  4: "Next: Registration", 5: "Next: Review", 6: "Publish registration"
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
 * Shared guided season setup. Transport is injected via callback props
 * so the same component
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
  actorId,
  orgs,
  sports,
  governingBodies,
  createLeague,
  createSeason,
  createDivision,
  listRegions,
  createRegion,
  onComplete,
  orgSports = {},
  renderCreateOrg,
  listLeagues,
  uploadLogo,
  listSeasons,
  prepareRegistration
}: {
  actorId: string;
  /** Pre-filtered to the orgs the caller is allowed to write to. */
  orgs: Org[];
  uploadLogo?: UploadLogo;
  prepareRegistration: (seasonId: string, body: GuidedRegistrationSetupInput) => Promise<{ formId: string; published: boolean; seasonStatus: string }>;
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
  /** Called after a successful run. Consuming app decides where to send the admin. */
  onComplete: (result: { leagueId: string; seasonId: string; formId?: string; published?: boolean }) => void;
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
  const reducedMotion = useReducedMotion();
  const firstStep: WizardStep = orgs.length === 1 && !renderCreateOrg ? 2 : 1;
  const [seasonPanel, setSeasonPanel] = useState<SeasonPanel>("season");
  // Orgs created in step 1 join the list without a page reload.
  const [orgList, setOrgList] = useState<Org[]>(orgs);
  // Step 2 / 3 "use existing" choices (SP-Changes item 2). Null = create new.
  const [existingLeague, setExistingLeague] = useState<League | null>(null);
  const [existingSeason, setExistingSeason] = useState<Season | null>(null);
  const [orgLeagues, setOrgLeagues] = useState<League[]>([]);
  const [leagueSeasons, setLeagueSeasons] = useState<Season[]>([]);
  const [state, setState] = useState<WizardState>(() => ({
    step: firstStep,
    // Auto-select when there's only one option (org-admin case).
    orgId: orgs.length === 1 ? orgs[0]!.id : null,
    league: defaultLeagueDraft(
      orgs.length === 1 ? orgSports[orgs[0]!.id] ?? "" : ""
    ),
    season: defaultSeasonDraft(),
    divisions: [emptyDivision(crypto.randomUUID())]
  }));
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState<RegistrationDraft>(defaultRegistrationDraft);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const setupRequestId = useRef(crypto.randomUUID());
  const lastStep: WizardStep = existingSeason ? 4 : 6;
  useEffect(() => setReviewConfirmed(false), [state.orgId, state.league, state.season, state.divisions, registration]);
  const [uploadingLogo,setUploadingLogo] = useState(false);
  // Set once the save or publish went through. The buttons stay off
  // while the league page loads: a second click in that gap started a
  // fresh run and created another league (PPHL, 24 Oct item 3).
  const [done, setDone] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport=window.visualViewport;
    let restingHeight=viewport?.height??window.innerHeight;
    const update=()=>{
      const target=document.activeElement;
      const editing=target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !['checkbox','radio','file','button','submit'].includes(target.type));
      const height=viewport?.height??window.innerHeight;
      if(!editing)restingHeight=height;
      const open=window.innerWidth<640 && editing && (window.innerHeight-height>100 || restingHeight-height>100);
      workspace.current?.setAttribute('data-keyboard-open',String(open));
    };
    const dismissMenus=(event:PointerEvent)=>{workspace.current?.querySelectorAll<HTMLDetailsElement>('details[data-phone-menu][open]').forEach(menu=>{if(event.target instanceof Node&&!menu.contains(event.target))menu.removeAttribute('open');});};
    document.addEventListener('pointerdown',dismissMenus);
    window.addEventListener('resize',update);viewport?.addEventListener('resize',update);
    document.addEventListener('focusin',update);document.addEventListener('focusout',update);
    return ()=>{document.removeEventListener('pointerdown',dismissMenus);window.removeEventListener('resize',update);viewport?.removeEventListener('resize',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);};
  },[]);
  function phoneFields() { return Array.from(workspace.current?.querySelectorAll<HTMLInputElement>('input:not([type=file]):not([type=checkbox]):not([type=radio])')??[]).filter(input=>!input.matches(':disabled')&&!input.closest('details:not([open])')&&input.getClientRects().length>0); }

  useEffect(() => {
    if (!draftReady) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [state.step, seasonPanel, draftReady]);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const storageKey = `sportspulse:season-setup:${actorId}`;
  // What the current submit run has saved so far (see submit()).
  const progress = useRef<{
    leagueId?: string;
    leagueName?: string;
    seasonId?: string;
    regionIds?: Record<string, string>;
    registrationSaved?: boolean;
    divisionUids: Set<string>;
  }>({ divisionUids: new Set() });
  // What was saved for one organization / league choice must not be
  // reused for another.
  const choice = `${state.orgId ?? ""}:${existingLeague?.id ?? ""}:${existingSeason?.id ?? ""}`;
  const previousChoice = useRef(choice);
  useEffect(() => {
    if (previousChoice.current !== choice) {
      progress.current = { divisionUids: new Set() };
      previousChoice.current = choice;
    }
  }, [choice]);
  useEffect(() => {
    let live = true;
    async function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (saved?.version !== 1 || !saved.state || !orgs.some(o => o.id === saved.state.orgId)) return;
        if (!Array.isArray(saved.state.divisions) || !saved.state.divisions.length ||
          !saved.registration?.definition?.waivers || !Array.isArray(saved.registration.definition.questions)) return;
        const league = saved.existingLeagueId && listLeagues ? (await listLeagues(saved.state.orgId)).find(l => l.id === saved.existingLeagueId) : null;
        const season = saved.existingSeasonId && league && listSeasons ? (await listSeasons(league.id)).find(s => s.id === saved.existingSeasonId) : null;
        if ((saved.existingLeagueId && !league) || (saved.existingSeasonId && !season) || !live) return;
        previousChoice.current = `${saved.state.orgId}:${league?.id ?? ""}:${season?.id ?? ""}`;
        progress.current = { ...saved.progress, divisionUids: new Set(saved.progress?.divisionUids ?? []) };
        if (typeof saved.requestId === "string") setupRequestId.current = saved.requestId;
        setExistingLeague(league ?? null); setExistingSeason(season ?? null);
        setState({ ...saved.state, step: Math.max(firstStep, Math.min(saved.state.step ?? firstStep, season ? 4 : 6)) as WizardStep });
        if (["season", "registration", "options"].includes(saved.seasonPanel)) setSeasonPanel(saved.seasonPanel);
        setRegistration(saved.registration); setRestoredDraft(true);
      } catch { if (live) setStorageNote("The saved draft could not be restored. Start a new setup or return to an existing season."); }
      finally { if (live) setDraftReady(true); }
    }
    void restore();
    return () => { live = false; };
    // Restore once for this signed-in account; refreshes must not replace edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  function persistProgress() {
    if (!draftReady || done) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, state, registration, seasonPanel,
      requestId: setupRequestId.current, existingLeagueId: existingLeague?.id ?? null, existingSeasonId: existingSeason?.id ?? null,
      progress: { ...progress.current, divisionUids: [...progress.current.divisionUids] } })); }
    catch { setStorageNote("This browser could not save your draft. Keep this page open until setup finishes."); }
  }
  useEffect(() => {
    persistProgress();
    // Persist the current state and completed API phases, without replaying network writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, registration, seasonPanel, existingLeague?.id, existingSeason?.id, draftReady, busy, done]);
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

  // The slug follows the whole name as it is typed until the admin types in
  // the slug box; clearing that box lets it follow the name again. Guarding
  // on "no slug yet" froze it after the first keystroke ("PPHL Demo" -> "p").
  const slugTouched = useRef(false);
  function patchLeague(patch: Partial<LeagueDraft>) {
    if (patch.slug !== undefined) slugTouched.current = patch.slug !== "";
    setState((s) => {
      const next = { ...s.league, ...patch };
      if (patch.name !== undefined && patch.slug === undefined && !slugTouched.current) {
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
  // Copy: a new card directly below the source with every setting the
  // same and no name (PPHL letter item 5). Deep copy, see copyDivisionDraft.
  function copyDivision(uid: string) {
    setState((s) => {
      const i = s.divisions.findIndex((d) => d.uid === uid);
      if (i < 0) return s;
      const copy = copyDivisionDraft(s.divisions[i]!, crypto.randomUUID(), `Division ${i + 1}`);
      return {
        ...s,
        divisions: [...s.divisions.slice(0, i + 1), copy, ...s.divisions.slice(i + 1)]
      };
    });
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
    // The day as typed, in the season's zone (the UTC date is a day off east or west of it).
    const day = (iso: string | null) => calendarDateInZone(iso, x.timezone);
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
    orgLeagues.some((l) => l.id !== progress.current.leagueId && l.name.trim().toLowerCase() === state.league.name.trim().toLowerCase());

  const stepValidation = useMemo(() => {
    // Local-date today (YYYY-MM-DD) so we can compare against <input type="date">
    // values without timezone weirdness.
    const now = new Date();
    const today = calendarDateInZone(now, state.league.timezone || "UTC");
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
      3: !!existingSeason || !!progress.current.seasonId || Object.values(seasonDraftChecks(state.season, today)).every(Boolean),
      // Name, region name and every number inside the kernel ranges: the
      // card shows what is wrong under the field, the API refuses the same.
      4: state.divisions.length > 0 && state.divisions.every((d) => divisionDraftProblem(d) === null),
      5: guidedRegistrationProblem(registrationSetupInput(registration, setupRequestId.current, false, false)) === null,
      6: reviewConfirmed
    } as Record<WizardStep, boolean>;
  }, [state, existingLeague, existingSeason, leagueNameTaken, registration, reviewConfirmed]);

  const dateChecks = seasonDraftChecks(state.season, calendarDateInZone(new Date(), state.league.timezone || "UTC"));
  const guidingDates = state.step === 3 && !existingSeason && !progress.current.seasonId;
  const canAdvance = guidingDates ? dateChecks[seasonPanel] && (seasonPanel !== "options" || (dateChecks.season && dateChecks.registration)) : stepValidation[state.step];
  const nextLabel = guidingDates && seasonPanel !== "options" ? (seasonPanel === "season" ? "Next: Registration dates" : "Next: Playoffs") : STEP_NEXT_LABEL[state.step];

  function goNext() {
    if (!canAdvance) return;
    if (guidingDates && seasonPanel !== "options") { setSeasonPanel(seasonPanel === "season" ? "registration" : "options"); return; }
    if (state.step < lastStep) {
      setState((s) => ({ ...s, step: (s.step + 1) as WizardStep }));
    }
  }
  function goBack() {
    if (guidingDates && seasonPanel !== "season") { setSeasonPanel(seasonPanel === "options" ? "registration" : "season"); return; }
    if (state.step > firstStep) {
      setState((s) => ({ ...s, step: (s.step - 1) as WizardStep }));
    }
  }

  async function submit({ publish }: { publish: boolean }) {
    if (
      !stepValidation[1] ||
      !stepValidation[2] ||
      !stepValidation[3] ||
      !stepValidation[4] || (!existingSeason && (!stepValidation[5] || (publish && !reviewConfirmed)))
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
        persistProgress();
      }
      const league = { id: saved.leagueId };

      stepLabel = "season";
      // Registration and roster lock are the typed day in the season's own
      // zone (the league time zone from step 2), not the browser's: "Nov 4"
      // typed from India for a New York season was stored as Nov 3 18:30Z
      // and every page showed Nov 3 (PPHL, 4 Nov 2026).
      const zone = state.league.timezone;
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
        timezone: zone,
        registrationOpensAt: state.season.registrationOpensAt
          ? startOfDayInZone(state.season.registrationOpensAt, zone)
          : null,
        registrationClosesAt: state.season.registrationClosesAt
          ? endOfDayInZone(state.season.registrationClosesAt, zone)
          : null,
        rosterLockAt: state.season.rosterLockAt ? endOfDayInZone(state.season.rosterLockAt, zone) : null
      });
      saved.seasonId = season.id;
      persistProgress();

      stepLabel = "regions";
      // Regions typed inline: create each distinct new name once (case-
      // insensitive), reusing an existing region when the name matches.
      const regionIdByName = new Map([...regions.map((r) => [r.name.toLowerCase(), r.id] as [string, string]), ...Object.entries(saved.regionIds ?? {})]);
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
          saved.regionIds = { ...saved.regionIds, [key]: id };
          persistProgress();
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
        persistProgress();
      }

      let registrationResult: { formId: string; published: boolean; seasonStatus: string } | undefined;
      if (!existingSeason) {
        stepLabel = "registration setup";
        registrationResult = await prepareRegistration(season.id, registrationSetupInput(registration, setupRequestId.current, publish, reviewConfirmed));
      }

      if (!publish && registrationResult) {
        saved.registrationSaved = true;
        persistProgress();
        setRestoredDraft(true);
        return;
      }
      progress.current = { divisionUids: new Set() };
      setDone(publish ? "published" : "draft");
      try { localStorage.removeItem(storageKey); } catch { /* Saved server-side; navigation can continue. */ }
      onComplete({ leagueId: league.id, seasonId: season.id, formId: registrationResult?.formId, published: registrationResult?.published });
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

  const introduction = ({1:"Choose the organization this season belongs to.",2:"The name, sport and home time zone of your league.",3:"Choose the dates your teams will use.",4:"Group your teams, then adjust their rules if needed.",5:"Decide how players join and what they need.",6:"One last look. Registration opens only when you publish."})[state.step];
  return (
    <MotionConfig reducedMotion="user">
    <div className={styles.workspace} ref={workspace}
      onFocusCapture={event=>{if(window.innerWidth>=640||!(event.target instanceof HTMLInputElement)||!['text','number'].includes(event.target.type))return;const inputs=phoneFields();event.target.enterKeyHint=inputs.indexOf(event.target)<inputs.length-1?'next':'done';}}
      onKeyDownCapture={event=>{if(event.key==='Escape'&&event.target instanceof HTMLElement){const menu=event.target.closest<HTMLDetailsElement>('details[data-phone-menu][open]');if(menu){event.preventDefault();menu.removeAttribute('open');menu.querySelector('summary')?.focus({preventScroll:true});return;}}if(window.innerWidth>=640||event.key!=='Enter'||event.nativeEvent.isComposing||!(event.target instanceof HTMLInputElement)||!['text','number'].includes(event.target.type))return;event.preventDefault();const inputs=phoneFields(),next=inputs[inputs.indexOf(event.target)+1];if(next)next.focus();else event.target.blur();}}>
      <aside className={styles.rail}>
        <SetupPreview state={state} orgName={currentOrg?.displayName ?? currentOrg?.legalName ?? ""} firstStep={firstStep} lastStep={lastStep} panel={seasonPanel}>
        <ProgressBar step={state.step} labels={STEP_LABELS} validation={stepValidation} lastStep={lastStep} firstStep={firstStep}
          onNavigate={(s) => { if (!busy) { setReviewConfirmed(false); setState((p) => ({ ...p, step: s })); } }}/>
        </SetupPreview>
      </aside>
      <section className={styles.panel} aria-label="Guided season setup">
      <header className={styles.panelHeader}>
        <div className={styles.chapter}><span>Set up a season · step {state.step-firstStep+1} of {lastStep-firstStep+1}</span></div>
        <h1 ref={heading} tabIndex={-1}>
          {guidingDates ? ({ season: "When does the season run?", registration: "When can people register?", options: "Any playoff or roster dates?" }[seasonPanel]) : STEP_HEADLINES[state.step]}
        </h1>
        <p className={styles.intro}>{introduction}</p>
      </header>
      <div className={styles.body}>
      <div className={styles.notices}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {restoredDraft ? <Alert tone="info">{progress.current.registrationSaved ? "Draft saved. Registration is closed until you review and publish it. Saved details can be edited from the season page after setup finishes." : "Your unfinished setup has been restored. Continue from this step; completed saves will not be repeated."}</Alert> : null}
      {progress.current.leagueId && state.step <= 3 ? <Alert tone="info">The league and any completed setup steps are already saved. Continue to finish registration; edit saved details from the season page afterward.</Alert> : null}
      {restoredDraft ? <Button type="button" variant="ghost" disabled={busy} onClick={() => {
        try { localStorage.removeItem(storageKey); window.location.reload(); }
        catch { setStorageNote("This browser could not clear your saved draft."); }
      }}>Start a new setup</Button> : null}
      {restoredDraft && progress.current.leagueId ? <p className="text-sm text-fg-muted">Starting a new setup keeps the existing draft records in your league list.</p> : null}
      {storageNote ? <Alert tone="warning">{storageNote}</Alert> : null}

      </div>
      <fieldset disabled={busy || uploadingLogo || !draftReady || (state.step <= 3 && !!progress.current.leagueId) || ((state.step === 4 || state.step === 5) && !!progress.current.registrationSaved)}>
      <motion.div
        key={`step-${state.step}-${state.step===3?seasonPanel:""}`}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "tween", duration: reducedMotion ? 0 : 0.18, ease: [0.16,1,0.3,1] }}
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
            onSelect={(id) => {
              if (id !== state.orgId) { setExistingLeague(null); setExistingSeason(null); }
              setState((s) => ({
                ...s,
                orgId: id,
                // Follow the org's sport until the admin picks one.
                league: s.league.sportCode
                  ? s.league
                  : { ...s.league, sportCode: orgSports[id] ?? "" }
              }));
            }}
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
                uploadLogo={uploadLogo}
                onUploadBusy={setUploadingLogo}
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
                  name: `${x.name} (${statusLabel(x.status)})`
                }))}
                selectedId={existingSeason?.id ?? null}
                onPick={(id) => pickSeason(id)}
              />
            ) : null}
            {existingSeason ? null : (
              <SeasonStep
                timezone={state.league.timezone}
                panel={seasonPanel}
                onPanelChange={setSeasonPanel}
                checks={dateChecks}
                draft={state.season}
                leagueName={state.league.name}
                onChange={patchSeason}
              />
            )}
          </div>
        ) : null}
        {state.step === 4 ? (
          <DivisionsStep
            savedDivisionUids={progress.current.divisionUids}
            divisions={state.divisions}
            regions={regions}
            summary={{
              league: state.league,
              season: state.season,
              org: currentOrg
            }}
            onPatch={patchDivision}
            onAdd={addDivision}
            onCopy={copyDivision}
            onRemove={removeDivision}
          />
        ) : null}
        {state.step === 5 ? <RegistrationStep draft={registration} onChange={next => { setRegistration(next); setReviewConfirmed(false); }} /> : null}
        {state.step === 6 ? <RegistrationReview state={state} draft={registration} confirmed={reviewConfirmed} onConfirm={setReviewConfirmed} /> : null}
      </motion.div>
      </fieldset>
      </div>

      <Footer
        step={state.step}
        lastStep={lastStep}
        firstStep={firstStep}
        showBack={state.step > firstStep || (guidingDates && seasonPanel !== "season")}
        canAdvance={canAdvance}
        busy={busy || uploadingLogo || !draftReady}
        done={done}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={() => submit({ publish: false })}
        onPublish={() => submit({ publish: true })}
        nextLabel={nextLabel}
      />
      </section>
    </div>
    </MotionConfig>
  );
}

function Footer({
  step,
  lastStep,
  firstStep,
  showBack,
  canAdvance,
  busy,
  done,
  onBack,
  onNext,
  onSaveDraft,
  onPublish,
  nextLabel
}: {
  step: WizardStep;
  lastStep: WizardStep;
  firstStep: WizardStep;
  showBack: boolean;
  canAdvance: boolean;
  busy: boolean;
  done: "draft" | "published" | null;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  nextLabel: string;
}) {
  return (
    <div className={styles.footer}>
      {showBack ? (
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-mono text-[10px] uppercase tracking-widest">Back</span>
        </Button>
      ) : (
        <span />
      )}
      <p className={styles.footerCount}>
        Step {step - firstStep + 1} of {lastStep - firstStep + 1}
      </p>
      {step < lastStep ? (
        <Button type="button" className={styles.primary} onClick={onNext} disabled={!canAdvance || busy}>
          <span className="font-mono text-[10px] uppercase tracking-widest">{nextLabel}</span>
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          {lastStep === 6 ? <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveDraft}
            disabled={busy || !!done}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-widest">Save draft</span>
          </Button> : null}
          <Button
            type="button"
            onClick={onPublish}
            disabled={!canAdvance || busy || !!done}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest">
              {done === "published" ? "Saved" : lastStep === 6 ? "Publish registration" : "Save divisions"}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
