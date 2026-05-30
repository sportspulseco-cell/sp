"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, Clock, Rocket, Radio
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Input, Select
} from "@sportspulse/ui";
import {
  createSchedulerSupabaseClient,
  scheduler,
  type GenerateResponse
} from "./scheduler-client";

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
}

type RunStatus = GenerateResponse["status"];

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

export function SchedulingGenerateForm({ seasonId, divisions }: Props) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [gamesPerPair, setGamesPerPair] = useState("1");
  const [timeLimit, setTimeLimit] = useState("60");
  const [seed, setSeed] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    gamesPublished: number;
    publishedAt: string;
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
    setError(null); setResult(null);
    setPublishResult(null); setPublishError(null);
    setSubmitting(true);
    try {
      const res = await scheduler.generate({
        seasonId, divisionId,
        gamesPerPair: Number(gamesPerPair) || 1,
        timeLimitSeconds: Number(timeLimit) || 60,
        seed: seed.trim() || undefined
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSubmitting(false); }
  }

  async function onPublish() {
    if (!result?.runId) return;
    setPublishError(null); setPublishResult(null);
    setPublishing(true);
    try {
      const res = await scheduler.publish({
        seasonId, divisionId, scheduleRunId: result.runId
      });
      setPublishResult({ gamesPublished: res.gamesPublished, publishedAt: res.publishedAt });
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally { setPublishing(false); }
  }

  const isSuccess = result?.status === "OPTIMAL" || result?.status === "FEASIBLE";

  return (
    <div className="space-y-6">
      <LiveChannelBar status={channelStatus} lastBroadcast={lastBroadcast} />
      <form onSubmit={onSubmit} className="rounded-lg border border-border bg-bg p-6 space-y-5">
        <Field label="Division">
          <Select
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            disabled={submitting}
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Games per pair" hint="1 = single round-robin, 2 = double">
            <Input type="number" min="1" max="4" value={gamesPerPair}
              onChange={(e) => setGamesPerPair(e.target.value)} disabled={submitting} />
          </Field>
          <Field label="Time limit (seconds)" hint="Solver budget, max 300">
            <Input type="number" min="5" max="300" value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)} disabled={submitting} />
          </Field>
          <Field label="Seed" hint="Leave blank for a random seed (stored for replay)">
            <Input value={seed} onChange={(e) => setSeed(e.target.value)}
              disabled={submitting} placeholder="auto-generated" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting || !divisionId}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />Generating…</>
            ) : (
              <><Rocket className="h-4 w-4" strokeWidth={1.75} />Generate</>
            )}
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Locked fixtures will be preserved.
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
                <StatusIcon status={result.status} />{result.status}
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
                <Metric label="Locked preserved" value={result.gamesLockedPreserved ?? 0} />
                <Metric label="Solve time" value={`${result.solveTimeMs ?? 0} ms`} />
              </div>
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Next step</div>
                    <div className="mt-0.5 text-sm text-fg">
                      Publish flips published_at and broadcasts to subscribers.
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
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {publishResult.gamesPublished} games published @ {publishResult.publishedAt}
                  </p>
                )}
              </div>
            </>
          ) : (
            <InfeasibilitySection result={result} />
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
  const tone = status === "subscribed" ? "success"
    : status === "errored" || status === "closed" ? "warning" : "neutral";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg-subtle px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <Badge tone={tone} dot mono>
          <Radio className="h-3 w-3" strokeWidth={1.75} />
          {status === "subscribed" ? "LIVE"
            : status === "connecting" ? "CONNECTING"
            : status === "closed" ? "CLOSED" : "ERROR"}
        </Badge>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Realtime · schedule_published events on this season
        </span>
      </div>
      {lastBroadcast && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg">
          last: {lastBroadcast.gamesPublished} games @ {new Date(lastBroadcast.publishedAt).toLocaleTimeString()}
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

function InfeasibilitySection({ result }: { result: GenerateResponse }) {
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
                      {v.type}{v.teamId ? ` · team ${v.teamId.slice(0, 8)}` : ""}
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
