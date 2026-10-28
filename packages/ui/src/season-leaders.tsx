import { cn } from "./lib/cn";

/** Same shape as @sportspulse/api-client DivisionLeaders (kept structural so ui stays SDK-free). */
export interface LeaderRow {
  personId: string;
  personName: string | null;
  teamId: string;
  teamName: string | null;
  gp: number;
  goals: number;
  assists: number;
  points: number;
}
export interface DivisionLeadersView {
  divisionId: string;
  divisionName: string;
  leaders: { points: LeaderRow[]; goals: LeaderRow[]; assists: LeaderRow[] };
  standings: Array<{
    teamId: string;
    teamName: string | null;
    rank: number | null;
    gp: number; w: number; l: number; t: number; otl: number;
    points: number; gf: number; ga: number; gd: number;
  }>;
}

const BOARDS: Array<{ key: "points" | "goals" | "assists"; title: string }> = [
  { key: "points", title: "Points leaders" },
  { key: "goals", title: "Goals leaders" },
  { key: "assists", title: "Assists leaders" }
];

/**
 * Division standings and points / goals / assists leaders for one season
 * (FR-3.5.3). Same block on the admin, captain and player consoles.
 * `highlightTeamId` marks the viewer's team.
 */
export function SeasonLeadersBlock({
  data,
  highlightTeamId,
  showStandings = true
}: {
  data: DivisionLeadersView;
  highlightTeamId?: string | null;
  showStandings?: boolean;
}) {
  return (
    <section className="space-y-4" aria-label={`${data.divisionName} leaders`}>
      {showStandings ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Standings · {data.divisionName}</h3>
          {data.standings.length === 0 ? (
            <p className="text-[13px] text-fg-muted">No finalized games yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[13px]" aria-label={`Standings ${data.divisionName}`}>
                <thead className="bg-bg-subtle text-left font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Team</th>
                    {["GP", "W", "L", "T", "OTL", "PTS", "GF", "GA", "DIFF"].map((h) => (
                      <th key={h} className="px-3 py-2 text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((s) => (
                    <tr key={s.teamId} className={cn("border-t border-border", s.teamId === highlightTeamId && "bg-bg-subtle font-medium")}>
                      <td className="px-3 py-2 tabular-nums">{s.rank ?? "–"}</td>
                      <td className="px-3 py-2">{s.teamName ?? "Unnamed team"}</td>
                      {[s.gp, s.w, s.l, s.t, s.otl, s.points, s.gf, s.ga, s.gd].map((v, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {BOARDS.map((b) => (
          <div key={b.key} className="rounded-lg border border-border">
            <h3 className="border-b border-border px-3 py-2 text-[13px] font-semibold text-fg">{b.title}</h3>
            {data.leaders[b.key].length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-fg-muted">No {b.key} yet.</p>
            ) : (
              <ol className="divide-y divide-border" aria-label={b.title}>
                {data.leaders[b.key].map((r, i) => (
                  <li key={r.personId} className={cn("flex items-center gap-2 px-3 py-2 text-[13px]", r.teamId === highlightTeamId && "bg-bg-subtle")}>
                    <span className="w-5 tabular-nums text-fg-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-fg">{r.personName ?? "Unnamed player"}</span>
                      <span className="text-fg-muted"> · {r.teamName ?? "Unnamed team"}</span>
                    </span>
                    <span className="font-mono tabular-nums text-fg">{r[b.key]}</span>
                    <span className="shrink-0 text-right text-[12px] text-fg-muted">{r.gp} {r.gp === 1 ? "game" : "games"}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
