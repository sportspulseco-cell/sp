"use client";

import { useEffect, useState } from "react";
import {
  AlertOctagon,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { compliance } from "@/lib/api/browser-api";

type SeasonOption = { id: string; name: string };

/**
 * Workflow 7C §5 — admin compliance command bar.
 *
 * Single block that drives the three sweep endpoints + summary counts
 * + the duplicate-ID panel. Lives at the top of /admin/eligibility.
 */
export function ComplianceSweepBar({
  seasons,
  initialSeasonId
}: {
  seasons: SeasonOption[];
  initialSeasonId: string | null;
}) {
  const [seasonId, setSeasonId] = useState<string>(
    initialSeasonId ?? seasons[0]?.id ?? ""
  );
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [duplicates, setDuplicates] = useState<
    Awaited<ReturnType<typeof compliance.listDuplicates>>["groups"]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!seasonId) return;
    try {
      const [sum, dups] = await Promise.all([
        compliance.seasonSummary(seasonId),
        compliance.listDuplicates(seasonId)
      ]);
      setSummary(sum.counts);
      setDuplicates(dups.groups);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  async function runSweep() {
    if (!seasonId) return;
    setBusy("sweep");
    setError(null);
    try {
      const res = await compliance.runSeasonSweep(seasonId);
      setFlash(
        `Eligibility sweep complete — ${res.evaluated} evaluated, ${res.flagged} flagged.`
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runLockSweep() {
    if (!seasonId) return;
    setBusy("lock");
    setError(null);
    try {
      const res = await compliance.runLockSweep(seasonId);
      setFlash(
        `Lock sweep complete — ${res.expiring} expiring, ${res.expired} expired.`
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runPlayoffSweep() {
    if (!seasonId) return;
    setBusy("playoff");
    setError(null);
    try {
      const res = await compliance.runPlayoffSweep(seasonId);
      setFlash(
        `Playoff sweep complete — ${res.eligible}/${res.totalPlayers} eligible, ${res.ineligible} ineligible.`
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counts = summary ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-bg-subtle p-3">
        <div className="grid w-full max-w-xs gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Season
          </label>
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            <option value="">— pick a season —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          onClick={runSweep}
          disabled={!seasonId || busy !== null}
          variant="secondary"
        >
          {busy === "sweep" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run eligibility sweep
        </Button>
        <Button
          onClick={runLockSweep}
          disabled={!seasonId || busy !== null}
          variant="secondary"
        >
          {busy === "lock" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Clock className="mr-2 h-4 w-4" />
          )}
          Run lock sweep
        </Button>
        <Button
          onClick={runPlayoffSweep}
          disabled={!seasonId || busy !== null}
          variant="secondary"
        >
          {busy === "playoff" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trophy className="mr-2 h-4 w-4" />
          )}
          Run playoff sweep
        </Button>
        <Button variant="ghost" onClick={refresh} disabled={!seasonId}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {seasonId && summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
          <SummaryCard label="Eligible" count={counts.eligible ?? 0} tone="success" />
          <SummaryCard label="Pending" count={counts.pending ?? 0} tone="neutral" />
          <SummaryCard label="Expiring" count={counts.expiring ?? 0} tone="warning" />
          <SummaryCard label="Expired" count={counts.expired ?? 0} tone="danger" />
          <SummaryCard label="Flagged" count={counts.flagged ?? 0} tone="warning" />
          <SummaryCard label="Ineligible" count={counts.ineligible ?? 0} tone="danger" />
          <SummaryCard label="Waived" count={counts.waived ?? 0} tone="info" />
        </div>
      )}

      {duplicates.length > 0 && (
        <DuplicatePanel groups={duplicates} />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  tone
}: {
  label: string;
  count: number;
  tone: "success" | "neutral" | "warning" | "danger" | "info";
}) {
  return (
    <div className="rounded-md border border-border bg-surface-1 px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xl font-semibold tabular-nums text-fg">
          {count}
        </span>
        <Badge tone={tone} mono>
          {tone === "success"
            ? "ok"
            : tone === "warning"
              ? "watch"
              : tone === "danger"
                ? "action"
                : tone === "info"
                  ? "review"
                  : "—"}
        </Badge>
      </div>
    </div>
  );
}

function DuplicatePanel({
  groups
}: {
  groups: Awaited<ReturnType<typeof compliance.listDuplicates>>["groups"];
}) {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-950/30">
      <div className="mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <AlertOctagon className="h-4 w-4" />
        <p className="font-medium">
          {groups.length} duplicate membership ID{groups.length === 1 ? "" : "s"}{" "}
          found this season
        </p>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li
            key={g.externalId}
            className="rounded-md border border-amber-300/40 bg-white px-3 py-2 dark:border-amber-700/30 dark:bg-amber-950/40"
          >
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber-700 dark:text-amber-300">
              ID {g.externalId}
            </p>
            <ul className="mt-1.5 space-y-1 text-[13px]">
              {g.players.map((p) => (
                <li key={p.personId} className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-fg-muted" />
                  <span className="text-fg">
                    {[p.firstName, p.lastName].filter(Boolean).join(" ") ||
                      p.personId.slice(0, 8)}
                  </span>
                  <span className="font-mono text-[10px] text-fg-muted">
                    {p.personId.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-amber-800/80 dark:text-amber-200/80">
        Open each player's eligibility record below to approve one and reject the
        other. Auto-resolution will land once admins choose a default policy.
      </p>
    </div>
  );
}
