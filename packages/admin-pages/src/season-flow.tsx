import Link from "next/link";
import type {
  Division,
  Game,
  League,
  Page,
  Registration,
  RegistrationForm,
  Season,
  TeamMembership
} from "@sportspulse/api-client";
import { fetchAll } from "@sportspulse/api-client";
import { Badge, statusTone } from "@sportspulse/ui";

/**
 * "Where each season stands": the operator's home in both admin apps.
 * PPHL (24 Oct 2026) could not tell what to do next across 30 menu
 * items, so this reads the season lifecycle the way a league operator
 * thinks about it (set up → registration → teams → rosters → schedule →
 * results → playoffs), shows the live numbers behind each step, and
 * offers one next action per season that deep-links to the page that
 * does it.
 *
 * Every number is read from the API at render time; a failed call shows
 * a dash and a note instead of pretending the count is zero. The app
 * passes its own API bindings and link bases, so the same component
 * serves the admin console and the org console.
 */

export interface SeasonFlowApi {
  leagueMgmt: {
    listDivisions: (q: { seasonId?: string; limit?: number; cursor?: string }) => Promise<Page<Division>>;
  };
  adminTransfers: {
    listDivisionEntries: (q?: { status?: string; orgId?: string }) => Promise<{
      items: Array<{ teamId: string; entryStatus: string; seasonId: string }>;
    }>;
  };
  gameOps: {
    listGames: (q: { leagueId?: string; limit?: number; cursor?: string }) => Promise<Page<Game>>;
  };
  registration: {
    listForms: (q: { limit?: number; cursor?: string }) => Promise<Page<RegistrationForm>>;
    listRegistrations: (q?: { orgId?: string }) => Promise<Page<Registration>>;
  };
  roster: {
    listMemberships: (q: {
      seasonId?: string;
      activeOnly?: boolean;
      limit?: number;
      cursor?: string;
    }) => Promise<Page<TeamMembership>>;
  };
}

export interface SeasonFlowLinks {
  season: (id: string) => string;
  applications: (id: string) => string;
  generate: (id: string) => string;
  playoffs: (id: string) => string;
  forms: string;
  registrations: string;
  teamsNew: string;
  rosters: string;
  results: string;
  orgSetup: string;
  seasons: string;
}

const ADMIN_LINKS: SeasonFlowLinks = {
  season: (id) => `/seasons/${id}`,
  applications: (id) => `/seasons/${id}/applications`,
  generate: (id) => `/scheduling/${id}/generate`,
  playoffs: (id) => `/scheduling/${id}/playoffs`,
  forms: "/forms",
  registrations: "/registrations",
  teamsNew: "/teams/new",
  rosters: "/rosters",
  results: "/games",
  orgSetup: "/org-setup",
  seasons: "/seasons"
};

type StepKey = "setup" | "registration" | "teams" | "rosters" | "schedule" | "results" | "playoffs";

interface Step {
  key: StepKey;
  label: string;
  done: boolean;
  note: string;
  action?: { label: string; href: string };
}

interface SeasonRead {
  season: Season;
  leagueName: string;
  steps: Step[];
  numbers: Array<{ label: string; value: string }>;
  failed: string[];
}

const ACTIVE_STATUSES = new Set(["draft", "registration_open", "in_progress", "playoffs"]);
const STATUS_ORDER: Record<string, number> = { registration_open: 0, in_progress: 1, playoffs: 2, draft: 3 };
const EMPTY = { items: [], nextCursor: null };

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function readSeason(
  api: SeasonFlowApi,
  links: SeasonFlowLinks,
  season: Season,
  leagueName: string,
  registrations: Array<{ seasonId: string | null; status: string }>
): Promise<SeasonRead> {
  const failed: string[] = [];
  const safe = async <T,>(what: string, p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      failed.push(what);
      return fallback;
    }
  };

  const [divisions, entries, memberships, games, forms] = await Promise.all([
    safe("divisions", fetchAll((cursor) => api.leagueMgmt.listDivisions({ seasonId: season.id, limit: 100, cursor })), EMPTY as Page<Division>),
    safe("team applications", api.adminTransfers.listDivisionEntries({ status: "applied,pending_approval,accepted,confirmed" }), { items: [] }),
    safe("rosters", fetchAll((cursor) => api.roster.listMemberships({ seasonId: season.id, activeOnly: true, limit: 100, cursor })), EMPTY as Page<TeamMembership>),
    safe("games", fetchAll((cursor) => api.gameOps.listGames({ leagueId: season.leagueId, limit: 100, cursor })), EMPTY as Page<Game>),
    safe("forms", fetchAll((cursor) => api.registration.listForms({ limit: 100, cursor })), EMPTY as Page<RegistrationForm>)
  ]);

  const divisionIds = new Set(divisions.items.map((d) => d.id));
  const seasonEntries = entries.items.filter((e) => e.seasonId === season.id);
  const pendingEntries = seasonEntries.filter((e) => e.entryStatus === "applied" || e.entryStatus === "pending_approval");
  const placedTeams = new Set(
    seasonEntries.filter((e) => e.entryStatus === "accepted" || e.entryStatus === "confirmed").map((e) => e.teamId)
  );
  const seasonGames = games.items.filter((g) => g.divisionId !== null && divisionIds.has(g.divisionId));
  const playedGames = seasonGames.filter((g) => g.status === "completed" || g.status === "forfeited");
  const nextGame = seasonGames
    .filter((g) => g.status === "scheduled")
    .sort((a, b) => a.scheduledStartTsUtc.localeCompare(b.scheduledStartTsUtc))[0];
  const seasonRegs = registrations.filter((r) => r.seasonId === season.id);
  const waitingRegs = seasonRegs.filter((r) => r.status === "pending_review" || r.status === "pending_offline");
  const seasonForms = forms.items.filter(
    (f) => (f as { seasonId?: string | null }).seasonId === season.id || (f.scope === "season" && f.scopeId === season.id)
  );
  const publishedForm = seasonForms.some((f) => (f as { activeVersionId?: string | null }).activeVersionId);
  const players = new Set(memberships.items.map((m) => m.personId)).size;

  const regOpen = season.status === "registration_open";
  const past = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now();
  const later = season.status === "in_progress" || season.status === "playoffs" || season.status === "completed";

  const steps: Step[] = [
    {
      key: "setup",
      label: "Season set up",
      done: divisions.items.length > 0,
      note: `${plural(divisions.items.length, "division")} · ${fmtDate(season.startDate)} – ${fmtDate(season.endDate)}`,
      action: { label: "Add divisions", href: links.season(season.id) }
    },
    {
      key: "registration",
      label: "Registration",
      done: publishedForm && (past(season.registrationClosesAt) || later),
      note: !publishedForm
        ? "No form published"
        : regOpen
          ? `Open until ${fmtDate(season.registrationClosesAt)} · ${seasonRegs.length} received, ${waitingRegs.length} waiting`
          : `${seasonRegs.length} received · ${waitingRegs.length} waiting for review`,
      action: !publishedForm
        ? { label: "Create the registration form", href: links.forms }
        : waitingRegs.length > 0
          ? { label: `Review ${plural(waitingRegs.length, "registration")}`, href: links.registrations }
          : season.status === "draft"
            ? { label: "Open registration", href: links.season(season.id) }
            : { label: "Registration queue", href: links.registrations }
    },
    {
      key: "teams",
      label: "Teams",
      done: placedTeams.size > 0 && pendingEntries.length === 0,
      note: `${placedTeams.size} placed in divisions · ${plural(pendingEntries.length, "application")} waiting`,
      action: pendingEntries.length > 0
        ? { label: `Review ${plural(pendingEntries.length, "team application")}`, href: links.applications(season.id) }
        : { label: "Add teams", href: links.teamsNew }
    },
    {
      key: "rosters",
      label: "Rosters",
      done: players > 0,
      note: `${plural(players, "player")} rostered${season.rosterLockAt ? ` · lock ${fmtDate(season.rosterLockAt)}` : ""}`,
      action: { label: "Build rosters", href: links.rosters }
    },
    {
      key: "schedule",
      label: "Schedule",
      done: seasonGames.length > 0,
      note: seasonGames.length
        ? `${plural(seasonGames.length, "game")}${nextGame ? ` · next ${fmtDate(nextGame.scheduledStartTsUtc)}` : ""}`
        : "No games yet",
      action: { label: "Generate the schedule", href: links.generate(season.id) }
    },
    {
      key: "results",
      label: "Results & standings",
      done: seasonGames.length > 0 && playedGames.length === seasonGames.length,
      note: `${playedGames.length} of ${seasonGames.length} games final`,
      action: { label: "Enter results", href: links.results }
    },
    {
      key: "playoffs",
      label: "Playoffs",
      done: season.status === "completed" || season.status === "archived",
      note: season.playoffStartDate ? `${fmtDate(season.playoffStartDate)} – ${fmtDate(season.playoffEndDate)}` : "Not scheduled",
      action: { label: "Playoff bracket", href: links.playoffs(season.id) }
    }
  ];

  return {
    season,
    leagueName,
    steps,
    numbers: [
      { label: "Registrations", value: String(seasonRegs.length) },
      { label: "Teams", value: failed.includes("team applications") ? "—" : String(placedTeams.size) },
      { label: "Players", value: failed.includes("rosters") ? "—" : String(players) },
      { label: "Games", value: failed.includes("games") ? "—" : String(seasonGames.length) }
    ],
    failed
  };
}

export async function SeasonFlow({
  api,
  seasons,
  leagues,
  registrations,
  links: linkOverrides,
  orgId
}: {
  api: SeasonFlowApi;
  seasons: Season[];
  leagues: League[];
  /** Pass when the page already loaded them; otherwise read through the API. */
  registrations?: Array<{ seasonId: string | null; status: string }>;
  links?: Partial<SeasonFlowLinks>;
  /** Org console: limit the registration read to this org. */
  orgId?: string;
}) {
  const links = { ...ADMIN_LINKS, ...linkOverrides };
  const leagueName = new Map(leagues.map((l) => [l.id, l.name]));
  const live = seasons
    .filter((s) => ACTIVE_STATUSES.has(s.status))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.startDate.localeCompare(b.startDate));
  const shown = live.slice(0, 3);
  let regs = registrations;
  let regsFailed = false;
  if (!regs && shown.length) {
    try {
      regs = (await api.registration.listRegistrations(orgId ? { orgId } : undefined)).items;
    } catch {
      regs = [];
      regsFailed = true;
    }
  }
  const reads = await Promise.all(
    shown.map((s) => readSeason(api, links, s, leagueName.get(s.leagueId) ?? "League", regs ?? []))
  );
  if (regsFailed) for (const r of reads) r.failed.push("registrations");

  return (
    <section aria-labelledby="season-flow-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">// Home</p>
          <h2 id="season-flow-title" className="mt-1 text-[22px] font-semibold tracking-tight text-fg">
            Where each season stands
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Set up → registration → teams → rosters → schedule → results → playoffs. One next step per season.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <Link
            href={links.orgSetup}
            className="rounded-md border border-border bg-surface-1 px-3 py-1.5 font-medium text-fg hover:border-border-strong"
          >
            Start a new season
          </Link>
          <Link href={links.seasons} className="text-fg-muted hover:text-fg">
            All seasons{live.length > shown.length ? ` (${live.length - shown.length} more live)` : ""}
          </Link>
        </div>
      </div>

      {reads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-8 text-center">
          <p className="text-sm font-semibold text-fg">No live season yet</p>
          <p className="mt-1 text-sm text-fg-muted">Org setup creates the league, season and divisions in four steps.</p>
          <Link
            href={links.orgSetup}
            className="mt-4 inline-flex rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-bg"
          >
            Start a season
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {reads.map((r) => (
            <SeasonCard key={r.season.id} read={r} links={links} />
          ))}
        </div>
      )}
    </section>
  );
}

function SeasonCard({ read, links }: { read: SeasonRead; links: SeasonFlowLinks }) {
  const { season, steps } = read;
  const current = steps.find((s) => !s.done) ?? null;
  const next = current?.action;
  return (
    <article className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={links.season(season.id)} className="text-[16px] font-semibold text-fg hover:underline">
              {season.name}
            </Link>
            <Badge tone={statusTone(season.status)} mono>
              {season.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-fg-muted">{read.leagueName}</p>
        </div>
        {next ? (
          <Link
            href={next.href}
            className="inline-flex items-center gap-2 rounded-md bg-fg px-3 py-2 text-[13px] font-medium text-bg hover:opacity-90"
          >
            Next: {next.label}
          </Link>
        ) : (
          <span className="rounded-md border border-border px-3 py-2 text-[13px] text-fg-muted">Season complete</span>
        )}
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Season steps">
        {steps.map((s, i) => {
          const state = s.done ? "done" : s === current ? "current" : "todo";
          return (
            <li
              key={s.key}
              aria-current={state === "current" ? "step" : undefined}
              className={
                "rounded-lg border px-3 py-2 " +
                (state === "done"
                  ? "border-border bg-bg-subtle"
                  : state === "current"
                    ? "border-fg bg-surface-1"
                    : "border-dashed border-border bg-surface-1 opacity-70")
              }
            >
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                <span aria-hidden>{state === "done" ? "✓" : state === "current" ? "●" : "○"}</span>
                <span>Step {i + 1}</span>
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-fg">{s.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-muted">{s.note}</p>
            </li>
          );
        })}
      </ol>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3">
        {read.numbers.map((n) => (
          <div key={n.label} className="flex items-baseline gap-2">
            <dt className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">{n.label}</dt>
            <dd className="text-[14px] font-semibold tabular-nums text-fg">{n.value}</dd>
          </div>
        ))}
        {read.failed.length ? (
          <div className="text-[11px] text-fg-muted">
            Could not load {read.failed.join(", ")} for this season. Reload to try again.
          </div>
        ) : null}
      </dl>
    </article>
  );
}
