import Link from "next/link";
import { fetchAll } from "@sportspulse/api-client";
import type { League, Registration, Season } from "@/lib/api/types";
import { adminTransfers, gameOps, leagueMgmt, registration, roster } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";

/**
 * "Where each season stands": the operator's home. PPHL (24 Oct 2026)
 * could not tell what to do next across 30 menu items, so this reads the
 * season lifecycle the way a league operator thinks about it
 * (set up → registration → teams → rosters → schedule → results →
 * playoffs), shows the live numbers behind each step, and offers one
 * next action per season that deep-links to the page that does it.
 *
 * Every number is read from the API at render time; a failed call shows
 * "—" and a note instead of pretending the count is zero.
 */

type StepKey = "setup" | "registration" | "teams" | "rosters" | "schedule" | "results" | "playoffs";

interface Step {
  key: StepKey;
  label: string;
  done: boolean;
  /** Short status under the label, e.g. "3 divisions". */
  note: string;
  /** Deep link for the next action when this is the current step. */
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function readSeason(
  season: Season,
  leagueName: string,
  registrations: Registration[]
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
    safe("divisions", fetchAll((cursor) => leagueMgmt.listDivisions({ seasonId: season.id, limit: 100, cursor })), { items: [], nextCursor: null }),
    safe("team applications", adminTransfers.listDivisionEntries({ status: "applied,pending_approval,accepted,confirmed" }), { items: [] }),
    safe("rosters", fetchAll((cursor) => roster.listMemberships({ seasonId: season.id, activeOnly: true, limit: 100, cursor })), { items: [], nextCursor: null }),
    safe("games", fetchAll((cursor) => gameOps.listGames({ leagueId: season.leagueId, limit: 100, cursor })), { items: [], nextCursor: null }),
    safe("forms", fetchAll((cursor) => registration.listForms({ limit: 100, cursor })), { items: [], nextCursor: null })
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

  const steps: Step[] = [
    {
      key: "setup",
      label: "Season set up",
      done: divisions.items.length > 0,
      note: `${divisions.items.length} division${divisions.items.length === 1 ? "" : "s"} · ${fmtDate(season.startDate)} – ${fmtDate(season.endDate)}`,
      action: { label: "Add divisions", href: `/seasons/${season.id}` }
    },
    {
      key: "registration",
      label: "Registration",
      done: publishedForm && (past(season.registrationClosesAt) || season.status === "in_progress" || season.status === "playoffs" || season.status === "completed"),
      note: !publishedForm
        ? "No form published"
        : regOpen
          ? `Open until ${fmtDate(season.registrationClosesAt)} · ${seasonRegs.length} received, ${waitingRegs.length} waiting`
          : `${seasonRegs.length} received · ${waitingRegs.length} waiting for review`,
      action: !publishedForm
        ? { label: "Create the registration form", href: "/forms" }
        : waitingRegs.length > 0
          ? { label: `Review ${waitingRegs.length} registration${waitingRegs.length === 1 ? "" : "s"}`, href: "/registrations" }
          : season.status === "draft"
            ? { label: "Open registration", href: `/seasons/${season.id}` }
            : { label: "Registration queue", href: "/registrations" }
    },
    {
      key: "teams",
      label: "Teams",
      done: placedTeams.size > 0 && pendingEntries.length === 0,
      note: `${placedTeams.size} placed in divisions · ${pendingEntries.length} application${pendingEntries.length === 1 ? "" : "s"} waiting`,
      action: pendingEntries.length > 0
        ? { label: `Review ${pendingEntries.length} team application${pendingEntries.length === 1 ? "" : "s"}`, href: `/seasons/${season.id}/applications` }
        : { label: "Add teams", href: "/teams/new" }
    },
    {
      key: "rosters",
      label: "Rosters",
      done: players > 0,
      note: `${players} player${players === 1 ? "" : "s"} rostered${season.rosterLockAt ? ` · lock ${fmtDate(season.rosterLockAt)}` : ""}`,
      action: { label: "Build rosters", href: "/rosters" }
    },
    {
      key: "schedule",
      label: "Schedule",
      done: seasonGames.length > 0,
      note: seasonGames.length
        ? `${seasonGames.length} games${nextGame ? ` · next ${fmtDate(nextGame.scheduledStartTsUtc)}` : ""}`
        : "No games yet",
      action: { label: "Generate the schedule", href: `/scheduling/${season.id}/generate` }
    },
    {
      key: "results",
      label: "Results & standings",
      done: seasonGames.length > 0 && playedGames.length === seasonGames.length,
      note: `${playedGames.length} of ${seasonGames.length} games final`,
      action: { label: "Enter results", href: "/games" }
    },
    {
      key: "playoffs",
      label: "Playoffs",
      done: season.status === "completed" || season.status === "archived",
      note: season.playoffStartDate ? `${fmtDate(season.playoffStartDate)} – ${fmtDate(season.playoffEndDate)}` : "Not scheduled",
      action: { label: "Playoff bracket", href: `/scheduling/${season.id}/playoffs` }
    }
  ];

  return {
    season,
    leagueName,
    steps,
    numbers: [
      { label: "Registrations", value: failed.includes("forms") ? "—" : String(seasonRegs.length) },
      { label: "Teams", value: failed.includes("team applications") ? "—" : String(placedTeams.size) },
      { label: "Players", value: failed.includes("rosters") ? "—" : String(players) },
      { label: "Games", value: failed.includes("games") ? "—" : String(seasonGames.length) }
    ],
    failed
  };
}

export async function SeasonFlow({
  seasons,
  leagues,
  registrations
}: {
  seasons: Season[];
  leagues: League[];
  registrations: Registration[];
}) {
  const leagueName = new Map(leagues.map((l) => [l.id, l.name]));
  const live = seasons
    .filter((s) => ACTIVE_STATUSES.has(s.status))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.startDate.localeCompare(b.startDate));
  const shown = live.slice(0, 3);
  const reads = await Promise.all(shown.map((s) => readSeason(s, leagueName.get(s.leagueId) ?? "League", registrations)));

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
          <Link href="/org-setup" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 font-medium text-fg hover:border-border-strong">
            Start a new season
          </Link>
          <Link href="/seasons" className="text-fg-muted hover:text-fg">
            All seasons{live.length > shown.length ? ` (${live.length - shown.length} more live)` : ""}
          </Link>
        </div>
      </div>

      {reads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-8 text-center">
          <p className="text-sm font-semibold text-fg">No live season yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Org setup creates the league, season and divisions in four steps.
          </p>
          <Link href="/org-setup" className="mt-4 inline-flex rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-bg">
            Start a season
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-1">
          {reads.map((r) => (
            <SeasonCard key={r.season.id} read={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function SeasonCard({ read }: { read: SeasonRead }) {
  const { season, steps } = read;
  const current = steps.find((s) => !s.done) ?? null;
  const next = current?.action;
  return (
    <article className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/seasons/${season.id}`} className="text-[16px] font-semibold text-fg hover:underline">
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
