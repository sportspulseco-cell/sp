import { fetchAll, load } from "@sportspulse/api-client";
import { formatInZone } from "@sportspulse/kernel";
import { LoadError } from "@sportspulse/ui";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { gameOps, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { UrlFilters } from "@/components/ui/url-filters";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";

export const metadata = { title: "Misconduct report · Super Admin" };

/**
 * Misconduct report (FR-3.5.4): misconduct, game misconduct and match
 * penalties of one season, per player and per game, with the suspension
 * each led to. The season defaults to the newest one in progress.
 */
export default async function MisconductReportPage({
  searchParams
}: {
  searchParams?: Promise<{ seasonId?: string; q?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const seasons = await fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({ items: [] }));
  const ordered = [...seasons.items].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const live = ordered.find((s) => s.status === "in_progress" || s.status === "playoffs");
  const seasonId = sp.seasonId ?? live?.id ?? ordered[0]?.id;

  const header = (
    <PageHeader
      eyebrow="Reports"
      title="Misconduct report"
      description="Misconducts, game misconducts and match penalties by player and game."
    />
  );
  if (!seasonId) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState icon={ShieldAlert} title="No season yet" description="Create a season first." />
      </div>
    );
  }
  const result = await load(gameOps.misconductReport(seasonId));
  const q = sp.q?.trim().toLowerCase() ?? "";
  const hit = (...xs: Array<string | null>) => !q || xs.filter(Boolean).join(" ").toLowerCase().includes(q);
  if (result.ok) {
    result.data.items = result.data.items.filter((i) => hit(i.personName, i.teamName));
    result.data.players = result.data.players.filter((p) => hit(p.personName, p.teamName));
  }
  return (
    <div className="space-y-6">
      {header}
      <UrlFilters
        searchPlaceholder="Search by player or team"
        selects={[
          {
            param: "seasonId",
            label: "Season",
            allLabel: "Pick a season",
            options: ordered.map((s) => ({ value: s.id, label: s.name }))
          }
        ]}
      />
      {!result.ok ? (
        <LoadError what="the misconduct report" status={result.status} message={result.message} />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No misconducts this season"
          description={`No misconduct, game misconduct or match penalty is on a scoresheet in ${result.data.seasonName}.`}
        />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">By player · {result.data.seasonName}</h2>
            <Table>
              <THead>
                <TR>
                  <TH>Player</TH>
                  <TH>Team</TH>
                  <TH className="text-right">Misconducts</TH>
                  <TH className="text-right">Ejections</TH>
                </TR>
              </THead>
              <TBody>
                {result.data.players.map((p) => (
                  <TR key={p.personId}>
                    <TD>
                      <Link href={`/persons/${p.personId}`} className="text-fg hover:underline">
                        {p.personName ?? "Unnamed player"}
                      </Link>
                    </TD>
                    <TD className="text-fg-muted">{p.teamName ?? "Unnamed team"}</TD>
                    <TD className="text-right tabular-nums">{p.count}</TD>
                    <TD className="text-right tabular-nums">{p.ejections}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Every penalty</h2>
            <Table>
              <THead>
                <TR>
                  <TH>Game</TH>
                  <TH>Player</TH>
                  <TH>Penalty</TH>
                  <TH>Type</TH>
                  <TH>Suspension</TH>
                </TR>
              </THead>
              <TBody>
                {result.data.items.map((i) => (
                  <TR key={i.eventId}>
                    <TD>
                      <Link href={`/games/${i.gameId}`} className="text-fg hover:underline">
                        {i.gameLabel}
                      </Link>
                      <span className="block text-[12px] text-fg-muted">
                        {formatInZone(i.gameStartTsUtc, i.tz)}
                        {i.period ? ` · P${i.period}` : ""}
                        {i.divisionName ? ` · ${i.divisionName}` : ""}
                      </span>
                    </TD>
                    <TD>
                      {i.personName ?? "No player named"}
                      <span className="block text-[12px] text-fg-muted">{i.teamName ?? "Unnamed team"}</span>
                    </TD>
                    <TD>
                      {i.infractionLabel ?? "Penalty"}
                      {i.minutes ? `, ${i.minutes} min` : ""}
                    </TD>
                    <TD className={i.ejection ? "font-medium text-rose-600 dark:text-rose-400" : ""}>{i.penaltyClassLabel}</TD>
                    <TD className="text-fg-muted">
                      {i.suspension ? (
                        <Link href={`/persons/${i.personId}`} className="hover:underline">
                          {i.suspension.kind === "n_games" && i.suspension.nGames
                            ? `${i.suspension.nGames} games`
                            : i.suspension.kind.replace(/_/g, " ")}{" "}
                          · {i.suspension.status}
                        </Link>
                      ) : (
                        "None"
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}
