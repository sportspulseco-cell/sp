"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, Clock, Rocket
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Input, LocalDate, Select
} from "@sportspulse/ui";
import {
  createSchedulerSupabaseClient,
  scheduler,
  type GenerateResponse
} from "./scheduler-client";
import { BlackoutDates, type BlackoutApi } from "./blackout-dates";
import { TeamPreferences } from "./team-preferences";
import type { TeamScheduleConstraints } from "./scheduler-client";

interface PublishBroadcast {
  seasonId: string;
  divisionId: string | null;
  scheduleRunId: string | null;
  publishedAt: string;
  gamesPublished: number;
}

interface Division { id: string; name: string }
interface Props {
  seasonId: string;
  seasonName: string;
  divisions: Division[];
  /** Team id to name, so violations show names instead of ids. */
  teamNames?: Record<string, string>;
  divisionTeamIds?: Record<string,string[]>;
  loadTeams?: (divisionId: string) => Promise<Array<{ id: string; name: string }>>;
  timezone?: string;
  /**
   * Publish through the API (SCH-8): the games go on every team's schedule
   * and each team's people get one notice. Each app binds its SDK here.
   */
  publishSchedule?: (req: {
    seasonId: string;
    divisionId?: string;
    scheduleRunId?: string;
  }) => Promise<{
    gamesPublished: number;
    publishedAt: string;
    teamsNotified: number;
    notificationsQueued: number;
  }>;
  /** Blackout dates on the server (FR-3.8.4). Hidden when not bound. */
  blackoutApi?: BlackoutApi;
}

type RunStatus = GenerateResponse["status"];
const RUN_LABELS: Record<RunStatus, string> = { OPTIMAL: "Draft schedule ready", FEASIBLE: "Draft schedule ready",
  TIMEOUT: "Generation timed out", INFEASIBLE: "No schedule fits these settings", FAILED: "Generation failed" };

function statusBadgeTone(status: RunStatus): "success" | "info" | "warning" | "danger" {
  switch (status) {
    case "OPTIMAL": return "success";
    case "FEASIBLE": return "info";
    case "TIMEOUT": return "warning";
    case "INFEASIBLE":
    case "FAILED": return "danger";
  }
}

function StatusIcon({ status }: { status: RunStatus }) {
  const cls = "h-4 w-4";
  if (status === "OPTIMAL" || status === "FEASIBLE")
    return <CheckCircle2 className={cls} strokeWidth={1.75} />;
  if (status === "TIMEOUT") return <Clock className={cls} strokeWidth={1.75} />;
  return <XCircle className={cls} strokeWidth={1.75} />;
}

export function SchedulingGenerateForm({ seasonId, divisions, teamNames: initialTeamNames = {}, divisionTeamIds, loadTeams, timezone = "UTC", publishSchedule, blackoutApi }: Props) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [gamesPerPair, setGamesPerPair] = useState("1");
  const [timeLimit, setTimeLimit] = useState("60");
  const [seed, setSeed] = useState("");
  const [weeklyMax, setWeeklyMax] = useState("");
  const [lateCap, setLateCap] = useState("");
  const [teamConstraints,setTeamConstraints] = useState<Record<string,TeamScheduleConstraints>>({});
  const [venues,setVenues] = useState<Array<{id:string;name:string}>>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [teamNames, setTeamNames] = useState(initialTeamNames), [teamsLoading, setTeamsLoading] = useState(!!loadTeams);
  const [teamsError, setTeamsError] = useState("");
  const [blackoutsReady, setBlackoutsReady] = useState(!blackoutApi);
  useEffect(() => {
    if (!loadTeams || !divisionId) return;
    let live = true; setTeamsLoading(true); setTeamsError(""); setTeamNames({});
    loadTeams(divisionId).then(rows => { if (live) setTeamNames(Object.fromEntries(rows.map(row => [row.id, row.name]))); })
      .catch(error => { if (live) setTeamsError(error instanceof Error ? error.message : "Could not load this division's teams."); })
      .finally(() => { if (live) setTeamsLoading(false); });
    return () => { live = false; };
    // The app's binding is stable for the current season.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, divisionId, settingsRetry]);
  useEffect(() => {
    let live = true;
    setSettingsLoading(true); setSettingsError(""); setResult(null); setPublishResult(null);
    scheduler.listRuns({ seasonId, divisionId, includeSettings: true, limit: 1 }).then(data => {
      if (!live) return;
      const saved = data.runs[0]?.settings;
      if (data.runs.length && !saved) throw new Error("Saved schedule constraints could not be read. Retry before generating.");
      setGamesPerPair(String(saved?.gamesPerPair ?? 1));
      setTimeLimit(String(saved?.timeLimitSeconds ?? 60)); setSeed("");
      setWeeklyMax(saved?.maxGamesPerTeamPerWeek == null ? "" : String(saved.maxGamesPerTeamPerWeek));
      setLateCap(saved?.maxLateFraction == null ? "" : String(saved.maxLateFraction * 100));
      setTeamConstraints(saved?.teamConstraints ?? {});
    }).catch((e: Error) => { if (live) setSettingsError(e.message); })
      .finally(() => { if (live) setSettingsLoading(false); });
    return () => { live = false; };
  }, [seasonId, divisionId, settingsRetry]);


  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    gamesPublished: number;
    publishedAt: string;
    teamsNotified?: number;
    notificationsQueued?: number;
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [channelStatus, setChannelStatus] = useState<
    "connecting" | "subscribed" | "closed" | "errored"
  >("connecting");
  const [lastBroadcast, setLastBroadcast] = useState<PublishBroadcast | null>(null);

  useEffect(() => {
    const sb = createSchedulerSupabaseClient();
    const channel = sb.channel(`schedule:season:${seasonId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on("broadcast", { event: "schedule_published" }, (msg: any) => {
      const payload = msg?.payload as PublishBroadcast | undefined;
      if (payload) setLastBroadcast(payload);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setChannelStatus("subscribed");
      else if (status === "CLOSED") setChannelStatus("closed");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        setChannelStatus("errored");
    });
    return () => { sb.removeChannel(channel); };
  }, [seasonId]);

  if (divisions.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No divisions in this season"
        description="The scheduler runs per-division. Create a division on the Season page first."
      />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (settingsLoading || settingsError || teamsLoading || teamsError || !blackoutsReady) return;
    setError(null); setResult(null);
    setPublishResult(null); setPublishError(null);
    setSubmitting(true);
    try {
      const res = await scheduler.generate({
        seasonId, divisionId,
        gamesPerPair: Number(gamesPerPair) || 1,
        timeLimitSeconds: Number(timeLimit) || 60,
        seed: seed.trim() || undefined,
        maxGamesPerTeamPerWeek: weeklyMax ? Number(weeklyMax) : undefined,
        maxLateFraction: lateCap === "" ? undefined : Number(lateCap)/100,
        teamConstraints: Object.fromEntries(Object.entries(teamConstraints).filter(([id])=>!divisionTeamIds || divisionTeamIds[divisionId]?.includes(id)))
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSubmitting(false); }
  }

  async function onPublish() {
    if (!result?.runId) return;
    setPublishError(null); setPublishResult(null);
    try {
      const open = (await scheduler.listConflicts({ seasonId })).conflicts.length;
      if (open > 0) {
        setPublishError(`Resolve the ${open} open schedule ${open === 1 ? "conflict" : "conflicts"} on the Conflicts tab before publishing.`);
        return;
      }
    } catch {
      setPublishError("We could not verify schedule conflicts. Try again before publishing.");
      return;
    }
    setPublishing(true);
    try {
      if (publishSchedule) {
        const res = await publishSchedule({ seasonId, divisionId, scheduleRunId: result.runId });
        setPublishResult(res);
      } else {
        const res = await scheduler.publish({
          seasonId, divisionId, scheduleRunId: result.runId
        });
        setPublishResult({ gamesPublished: res.gamesPublished, publishedAt: res.publishedAt });
      }
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally { setPublishing(false); }
  }

  const isSuccess = result?.status === "OPTIMAL" || result?.status === "FEASIBLE";

  return (
    <div className="space-y-6">
      <LiveChannelBar status={channelStatus} lastBroadcast={lastBroadcast} />
      {blackoutApi ? <BlackoutDates key={seasonId} api={blackoutApi} disabled={submitting || settingsLoading} onReadyChange={setBlackoutsReady} onRinksLoaded={rows => setVenues([...new Map(rows.filter(row => row.venueId).map(row => [row.venueId!, { id: row.venueId!, name: row.venueName ?? row.label }])).values()])} /> : null}
      <form onSubmit={onSubmit} className="rounded-lg border border-border bg-bg p-6 space-y-5">
        <Field label="Division">
          <Select
            value={divisionId}
            onChange={(e) => { if (e.target.value === divisionId) return; setSettingsLoading(true); setTeamsLoading(!!loadTeams); setResult(null); setPublishResult(null); setDivisionId(e.target.value); }}
            disabled={submitting || settingsLoading}
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Games per pair" hint="1 = single round-robin, 2 = double">
            <Input type="number" min="1" max="4" value={gamesPerPair}
              onChange={(e) => setGamesPerPair(e.target.value)} disabled={submitting || settingsLoading} />
          </Field>
          <Field label="Max games per team per week" hint="Optional hard limit, including fixed games.">
            <Input type="number" min="1" max="7" value={weeklyMax} placeholder="No limit"
              onChange={(e) => setWeeklyMax(e.target.value)} disabled={submitting || settingsLoading} />
          </Field>
        </div>
        <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Advanced generation settings</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Time limit (seconds)" hint="Maximum time to look for a suitable schedule.">
            <Input type="number" min="5" max="300" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} disabled={submitting || settingsLoading} />
          </Field><Field label="Seed" hint="Optional. Reuse a value when comparing generation results.">
            <Input value={seed} onChange={(e) => setSeed(e.target.value)}
              disabled={submitting || settingsLoading} placeholder="auto-generated" />
          </Field></div>
        </details>
        <Field label="Maximum late games (%)" hint="Optional hard limit per team. 0 means no late games."><Input type="number" min="0" max="100" value={lateCap} onChange={e=>setLateCap(e.target.value)} disabled={submitting || settingsLoading} placeholder="No limit"/></Field>
        {teamsLoading ? <p role="status" className="text-sm text-fg-muted">Loading this division's teams…</p> : null}
        {teamsError ? <div role="alert" className="text-sm text-fg-muted">{teamsError} <Button type="button" variant="outline" size="sm" onClick={() => setSettingsRetry(value => value + 1)}>Retry teams</Button></div> : null}
        <TeamPreferences key={divisionId} teams={Object.fromEntries(Object.entries(teamNames).filter(([id])=>loadTeams || !divisionTeamIds || divisionTeamIds[divisionId]?.includes(id)))} venues={venues} timezone={timezone} value={teamConstraints} onChange={setTeamConstraints} disabled={submitting || settingsLoading || teamsLoading || !!teamsError || !blackoutsReady}/>
        <div className="flex items-center gap-3">
          {settingsLoading ? <p className="text-sm text-fg-muted" role="status">Loading this division's saved schedule settings…</p> : null}
          {settingsError ? <div role="alert" className="text-sm text-danger">{settingsError} <Button type="button" variant="outline" size="sm" onClick={() => setSettingsRetry(n => n + 1)}>Retry</Button></div> : null}
          <Button type="submit" disabled={submitting || !divisionId || settingsLoading || !!settingsError || teamsLoading || !!teamsError || !blackoutsReady}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />Generating…</>
            ) : (
              <><Rocket className="h-4 w-4" strokeWidth={1.75} />Generate</>
            )}
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Only draft games are replaced. Published, playoff and locked games stay.
          </span>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-border bg-bg p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 text-fg">
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Request failed</span>
          </div>
          <p className="text-fg-muted">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-bg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge tone={statusBadgeTone(result.status)}>
                <StatusIcon status={result.status} />{RUN_LABELS[result.status]}
              </Badge>
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                run {result.runId.slice(0, 8)}…
              </span>
            </div>
            {typeof result.solveTimeMs === "number" && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {result.solveTimeMs} ms
              </span>
            )}
          </div>
          {isSuccess ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Metric label="Games created" value={result.gamesCreated} />
                <Metric label="Games kept" value={result.kept?.total ?? result.gamesLockedPreserved ?? 0} />
                <Metric label="Home/away gap" value={result.maxHomeAwayImbalance ?? 0} />
              </div>
              {result.message ? <p className="text-sm text-fg">{result.message}</p> : null}
              {result.weeklyOverLimit && result.weeklyOverLimit.length > 0 ? (
                <div className="rounded-md border border-border bg-bg-subtle p-3 text-sm">
                  <p className="text-fg">
                    {result.weeklyOverLimit.length} team weeks go over {weeklyMax} games. Adjust fixed games or raise the limit before generating again.
                  </p>
                  <ul className="mt-2 space-y-1 text-fg-muted">
                    {result.weeklyOverLimit.slice(0, 8).map((x) => (
                      <li key={`${x.teamId}-${x.weekStart}`}>
                        {teamNames[x.teamId] ?? "Unnamed team"}: {x.games} games in the week of {x.weekStart}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Next step</div>
                    <div className="mt-0.5 text-sm text-fg">
                      Publishing puts these games on every team&apos;s schedule and sends each
                      team&apos;s players, captains and coaches one notice.
                    </div>
                  </div>
                  <Button onClick={onPublish} disabled={publishing || !!publishResult}>
                    {publishing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />Publishing…</>
                    ) : publishResult ? (
                      <><CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />Published</>
                    ) : (
                      <><Rocket className="h-4 w-4" strokeWidth={1.75} />Publish</>
                    )}
                  </Button>
                </div>
                {publishError && (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-danger">
                    {publishError}
                  </p>
                )}
                {publishResult && (
                  <p className="text-sm text-fg">
                    {publishResult.gamesPublished === 0
                      ? "Nothing left to publish. These games were already on team schedules."
                      : `${publishResult.gamesPublished} ${publishResult.gamesPublished === 1 ? "game" : "games"} published.`}
                    {publishResult.gamesPublished > 0 && publishResult.notificationsQueued !== undefined
                      ? ` ${publishResult.notificationsQueued} notices queued for ${publishResult.teamsNotified ?? 0} ${publishResult.teamsNotified === 1 ? "team" : "teams"}.`
                      : null}
                  </p>
                )}
              </div>
            </>
          ) : (
            <InfeasibilitySection result={result} teamNames={teamNames} />
          )}
        </div>
      )}
    </div>
  );
}

function LiveChannelBar({
  status, lastBroadcast
}: {
  status: "connecting" | "subscribed" | "closed" | "errored";
  lastBroadcast: PublishBroadcast | null;
}) {
  if (status === "subscribed" && !lastBroadcast) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
      {status === "connecting" ? <span>Connecting live updates…</span> : status !== "subscribed" ? <span>Live updates are unavailable. Refresh the page to get the latest changes.</span> : null}
      {lastBroadcast && (
        <span>
          Schedule updated: {lastBroadcast.gamesPublished} games at <LocalDate iso={lastBroadcast.publishedAt} format="time" />
        </span>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-fg">{value}</div>
    </div>
  );
}

function InfeasibilitySection({
  result, teamNames
}: {
  result: GenerateResponse;
  teamNames: Record<string, string>;
}) {
  const inf = result.infeasibility;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-fg">{inf?.summary ?? result.error ?? "The solver could not produce a schedule."}</p>
      {inf && (
        <>
          {inf.hardViolations.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">Hard violations</div>
              <ul className="space-y-2">
                {inf.hardViolations.map((v, i) => (
                  <li key={i} className="rounded-md border border-border bg-bg-subtle p-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{v.type}</div>
                    <div className="mt-1 text-fg">{v.description}</div>
                    {v.resolutionHint && (
                      <div className="mt-1 text-fg-muted">→ {v.resolutionHint}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inf.softViolations.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">Soft violations</div>
              <ul className="space-y-2">
                {inf.softViolations.map((v, i) => (
                  <li key={i} className="rounded-md border border-border bg-bg-subtle p-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      {v.type}{v.teamId ? ` · ${teamNames[v.teamId] ?? "Unnamed team"}` : ""}
                    </div>
                    <div className="mt-1 text-fg">{v.description}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
