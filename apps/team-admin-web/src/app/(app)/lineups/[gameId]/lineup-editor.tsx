"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import { gameOps } from "@/lib/api/browser-api";

type Bucket = "starters" | "bench" | "scratches";

type RosterPlayer = {
  personId: string;
  name: string;
  jerseyNumber: string;
  positionCode: string;
};

type Assignment = {
  bucket: Bucket;
  jerseyNumber: string;
  positionCode: string;
  reason: string;
};

type Initial = {
  starters: Array<{
    personId: string;
    jerseyNumber?: string;
    positionCode?: string;
  }>;
  bench: Array<{
    personId: string;
    jerseyNumber?: string;
    positionCode?: string;
  }>;
  scratches: Array<{ personId: string; reason?: string }>;
};

/**
 * Captain-facing lineup editor. Each active roster row is a single
 * row in the table with three radio buttons (starter / bench /
 * scratch) plus inline jersey + position inputs. Save submits the
 * whole grid via PUT /games/:gameId/lineups/:teamId. Locked once
 * the game flips to in_play.
 */
export function LineupEditor({
  gameId,
  teamId,
  roster,
  initial,
  locked,
  submittedAt
}: {
  gameId: string;
  teamId: string;
  roster: RosterPlayer[];
  initial: Initial;
  locked: boolean;
  submittedAt: string | null;
}) {
  const router = useRouter();

  // Build an initial assignment map: every roster row gets a bucket
  // (defaults to bench when never assigned).
  const initialMap = useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const p of roster) {
      m.set(p.personId, {
        bucket: "bench",
        jerseyNumber: p.jerseyNumber,
        positionCode: p.positionCode,
        reason: ""
      });
    }
    for (const s of initial.starters) {
      const existing = m.get(s.personId);
      if (existing) {
        existing.bucket = "starters";
        if (s.jerseyNumber) existing.jerseyNumber = s.jerseyNumber;
        if (s.positionCode) existing.positionCode = s.positionCode;
      }
    }
    for (const b of initial.bench) {
      const existing = m.get(b.personId);
      if (existing) {
        existing.bucket = "bench";
        if (b.jerseyNumber) existing.jerseyNumber = b.jerseyNumber;
        if (b.positionCode) existing.positionCode = b.positionCode;
      }
    }
    for (const s of initial.scratches) {
      const existing = m.get(s.personId);
      if (existing) {
        existing.bucket = "scratches";
        if (s.reason) existing.reason = s.reason;
      }
    }
    return m;
  }, [roster, initial]);

  const [assignments, setAssignments] =
    useState<Map<string, Assignment>>(initialMap);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function patch(personId: string, fields: Partial<Assignment>) {
    setAssignments((prev) => {
      const m = new Map(prev);
      const cur = m.get(personId);
      if (cur) m.set(personId, { ...cur, ...fields });
      return m;
    });
  }

  const startersCount = Array.from(assignments.values()).filter(
    (a) => a.bucket === "starters"
  ).length;
  const benchCount = Array.from(assignments.values()).filter(
    (a) => a.bucket === "bench"
  ).length;
  const scratchCount = Array.from(assignments.values()).filter(
    (a) => a.bucket === "scratches"
  ).length;

  async function save() {
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const starters: Array<{
        personId: string;
        jerseyNumber?: string;
        positionCode?: string;
      }> = [];
      const bench: Array<{
        personId: string;
        jerseyNumber?: string;
        positionCode?: string;
      }> = [];
      const scratches: Array<{ personId: string; reason?: string }> = [];
      for (const [personId, a] of assignments) {
        if (a.bucket === "starters") {
          starters.push({
            personId,
            jerseyNumber: a.jerseyNumber || undefined,
            positionCode: a.positionCode || undefined
          });
        } else if (a.bucket === "bench") {
          bench.push({
            personId,
            jerseyNumber: a.jerseyNumber || undefined,
            positionCode: a.positionCode || undefined
          });
        } else {
          scratches.push({
            personId,
            reason: a.reason || undefined
          });
        }
      }
      await gameOps.putLineup(gameId, teamId, { starters, bench, scratches });
      setFlash("Saved.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="Starters" value={startersCount} />
        <Stat label="Bench" value={benchCount} />
        <Stat label="Scratches" value={scratchCount} />
      </section>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        <table className="w-full divide-y divide-border">
          <thead className="bg-surface-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-left">Player</th>
              <th className="px-2 py-2 text-center">#</th>
              <th className="px-2 py-2 text-center">Pos</th>
              <th className="px-2 py-2 text-center">Starter</th>
              <th className="px-2 py-2 text-center">Bench</th>
              <th className="px-2 py-2 text-center">Scratch</th>
              <th className="px-4 py-2 text-left">Scratch reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roster.map((p) => {
              const a = assignments.get(p.personId);
              if (!a) return null;
              return (
                <tr key={p.personId}>
                  <td className="px-4 py-2 text-[14px] font-medium text-fg">
                    {p.name}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={a.jerseyNumber}
                      onChange={(e) =>
                        patch(p.personId, { jerseyNumber: e.target.value })
                      }
                      disabled={locked || a.bucket === "scratches"}
                      maxLength={3}
                      className="w-12 rounded-md border border-border bg-bg px-1.5 py-1 text-center text-[12px] disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={a.positionCode}
                      onChange={(e) =>
                        patch(p.personId, { positionCode: e.target.value })
                      }
                      disabled={locked || a.bucket === "scratches"}
                      maxLength={4}
                      className="w-12 rounded-md border border-border bg-bg px-1.5 py-1 text-center text-[12px] uppercase disabled:opacity-50"
                    />
                  </td>
                  {(["starters", "bench", "scratches"] as Bucket[]).map(
                    (b) => (
                      <td key={b} className="px-2 py-2 text-center">
                        <input
                          type="radio"
                          name={`bucket-${p.personId}`}
                          value={b}
                          checked={a.bucket === b}
                          disabled={locked}
                          onChange={() => patch(p.personId, { bucket: b })}
                          aria-label={`${p.name} · ${b}`}
                        />
                      </td>
                    )
                  )}
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={a.reason}
                      onChange={(e) =>
                        patch(p.personId, { reason: e.target.value })
                      }
                      disabled={locked || a.bucket !== "scratches"}
                      placeholder={
                        a.bucket === "scratches" ? "Injury / suspension / etc." : ""
                      }
                      className="w-full rounded-md border border-border bg-bg px-2 py-1 text-[12px] disabled:opacity-30"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-fg-muted">
          {submittedAt ? (
            <>
              Last saved{" "}
              <span className="font-mono text-fg">
                {new Date(submittedAt).toLocaleString()}
              </span>
            </>
          ) : locked ? (
            <Badge tone="danger" mono>locked — game in play</Badge>
          ) : (
            <>No lineup saved yet.</>
          )}
        </p>
        <Button onClick={save} disabled={saving || locked}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Check className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
              Save lineup
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-semibold tracking-tight text-fg">
        {value}
      </p>
    </div>
  );
}
