"use client";

import { useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { adminTransfers } from "@/lib/api/browser-api";

type Season = { id: string; name: string; leagueId: string; status: string };
type Item = {
  teamId: string;
  teamName: string;
  lastDivisionId: string;
  lastDivisionName: string;
  captainEmail: string | null;
  captainName: string | null;
};

export function NoShowReport({ seasons }: { seasons: Season[] }) {
  const [lastSeasonId, setLastSeasonId] = useState<string>("");
  const [newSeasonId, setNewSeasonId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function run() {
    if (!lastSeasonId || !newSeasonId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminTransfers.noShowReport({
        lastSeasonId,
        newSeasonId
      });
      setItems(res.items);
      setRan(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (items.length === 0) return;
    const header = "team_name,last_division,captain_email,captain_name\n";
    const rows = items
      .map((i) =>
        [
          quote(i.teamName),
          quote(i.lastDivisionName),
          quote(i.captainEmail ?? ""),
          quote(i.captainName ?? "")
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `no-show-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-md border border-border bg-bg-subtle p-3 md:grid-cols-3">
        <div className="grid gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Previous season
          </label>
          <Select
            value={lastSeasonId}
            onChange={(e) => setLastSeasonId(e.target.value)}
          >
            <option value="">— pick —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            New season
          </label>
          <Select
            value={newSeasonId}
            onChange={(e) => setNewSeasonId(e.target.value)}
          >
            <option value="">— pick —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button
            onClick={run}
            disabled={!lastSeasonId || !newSeasonId || busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Run report
              </>
            )}
          </Button>
          {items.length > 0 && (
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {ran && items.length === 0 && !busy && (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-8 text-center text-[13px] text-fg-muted">
          Every team that played the previous season has entered the new one.
          Nothing to follow up on.
        </p>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
              // {items.length} team{items.length === 1 ? "" : "s"} did not
              return
            </p>
          </header>
          <Table>
            <THead>
              <TR>
                <TH>Team</TH>
                <TH>Last division</TH>
                <TH>Captain email</TH>
                <TH>Captain</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.teamId}>
                  <TD className="font-medium">{i.teamName}</TD>
                  <TD className="text-fg-muted">{i.lastDivisionName}</TD>
                  <TD>{i.captainEmail ?? "—"}</TD>
                  <TD className="text-fg-muted">{i.captainName ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function quote(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
