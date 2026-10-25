"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Alert, LocalDate } from "@sportspulse/ui";
import { leagueMgmt, teamMovement } from "@/lib/api/browser-api";
import type { TeamEntry, TeamMovement, TeamMovementResult } from "@/lib/api/types";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";

type Mode = "rollover" | "division_shift" | "league_migration" | "org_move";

const MODE_LABELS: Record<Mode, string> = {
  rollover: "Roll over to a new season",
  division_shift: "Change division (same season)",
  league_migration: "Move to another league",
  org_move: "Move to another organisation"
};

const MOVEMENT_LABELS: Record<TeamMovement["kind"], string> = {
  rollover: "Rolled over",
  division_shift: "Division changed",
  league_migration: "League changed",
  org_move: "Organisation changed"
};

const LIVE = new Set(["pending_approval", "applied", "accepted", "confirmed"]);

interface SeasonOpt {
  id: string;
  name: string;
  leagueId: string;
  status: string;
  startDate: string;
}
interface NamedOpt {
  id: string;
  name: string;
}


/**
 * Lists a team's season instances and movement history, and runs the four
 * moves through a dialog whose pickers are names, never ids. One
 * idempotency key per dialog open, so a retried click cannot move twice.
 */
export function TeamMovementPanel({
  teamId,
  teamName,
  orgId,
  initialEntries,
  initialHistory,
  seasons,
  leagues,
  orgs
}: {
  teamId: string;
  teamName: string;
  orgId: string;
  initialEntries: TeamEntry[];
  initialHistory: TeamMovement[];
  seasons: SeasonOpt[];
  leagues: NamedOpt[];
  orgs: NamedOpt[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [history, setHistory] = useState(initialHistory);
  const [open, setOpen] = useState(false);
  const [lastResult, setLastResult] = useState<TeamMovementResult | null>(null);

  async function reload() {
    const [e, h] = await Promise.all([teamMovement.entries(teamId), teamMovement.history(teamId)]);
    setEntries(e.items);
    setHistory(h.items);
  }

  return (
    <div className="space-y-5">
      {lastResult ? (
        <Alert tone="success">
          <p className="font-medium">
            {MOVEMENT_LABELS[lastResult.movement.kind]}
            {lastResult.entry ? ` · now in ${lastResult.entry.seasonName} / ${lastResult.entry.divisionName}` : ""}
            {lastResult.replayed ? " (already done; nothing changed)" : ""}
          </p>
          {lastResult.warnings.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-[12px]">
              {lastResult.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-fg-muted">
          {entries.filter((e) => LIVE.has(e.entryStatus)).length} live season instance(s)
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
          Move team
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[13px] text-fg-muted">
          This team is not in any season yet. Register it through the captain&apos;s console or
          Team applications first.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Season</TH>
              <TH>League</TH>
              <TH>Division</TH>
              <TH>Status</TH>
              <TH>Since</TH>
              <TH>Note</TH>
            </TR>
          </THead>
          <TBody>
            {entries.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">{e.seasonName}</TD>
                <TD className="text-fg-muted">{e.leagueName}</TD>
                <TD>{e.divisionName}</TD>
                <TD>
                  <Badge tone={e.entryStatus === "moved" ? "neutral" : statusTone(e.entryStatus)}>
                    {e.entryStatus.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD className="text-fg-muted">
                  <LocalDate iso={e.joinedAt} />
                  {e.leftAt ? (
                    <>
                      {" → "}
                      <LocalDate iso={e.leftAt} />
                    </>
                  ) : null}
                </TD>
                <TD className="text-[12px] text-fg-muted">{entryNote(e)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {history.length > 0 ? (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Movement history
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {history.map((m) => (
              <li key={m.id} className="px-3 py-2 text-[12px]">
                <span className="font-medium text-fg">{MOVEMENT_LABELS[m.kind]}</span>
                <span className="text-fg-muted">
                  {" "}
                  {describeMovement(m)} · <LocalDate iso={m.createdAt} />
                  {m.movedByName ? ` · by ${m.movedByName}` : ""}
                  {m.reason ? ` · "${m.reason}"` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <MoveTeamDialog
        key={open ? "open" : "closed"}
        open={open}
        onClose={() => setOpen(false)}
        teamId={teamId}
        teamName={teamName}
        orgId={orgId}
        entries={entries}
        seasons={seasons}
        leagues={leagues}
        orgs={orgs}
        onDone={async (r) => {
          setLastResult(r);
          setOpen(false);
          await reload().catch(() => undefined);
          router.refresh();
        }}
      />
    </div>
  );
}

function entryNote(e: TeamEntry): string {
  const f = e.complianceFlags as Record<string, unknown>;
  const parts: string[] = [];
  if (e.movementKind === "rollover") parts.push(`Rolled over from ${f.sourceSeasonName ?? "previous season"}`);
  if (e.movementKind === "division_shift")
    parts.push(
      `Moved from ${f.shiftedFromDivisionName ?? "another division"}` +
        (e.carryStandings ? ", record carried over" : "")
    );
  if (e.movementKind === "league_migration") parts.push(`Migrated from ${f.sourceLeagueName ?? "another league"}`);
  if (f.feeScheduleReview) parts.push("check fee schedule");
  if (f.rosterRulesReview) parts.push("check roster rules");
  if (f.duesNotMoved || f.duesNotCopied) parts.push("dues not moved");
  if (typeof f.scheduledGamesLeftInSourceDivision === "number")
    parts.push(`${f.scheduledGamesLeftInSourceDivision} scheduled game(s) left behind`);
  return parts.join(" · ");
}

function describeMovement(m: TeamMovement): string {
  if (m.kind === "org_move") return `${m.fromOrgName ?? "?"} → ${m.toOrgName ?? "?"}`;
  const base = `${m.fromDivisionName ?? "?"} → ${m.toDivisionName ?? "?"}`;
  if (m.kind === "rollover") return `${base}, ${m.rosterCopied} player(s) copied`;
  if (m.kind === "division_shift")
    return `${base}, ${m.resetStandings ? "standings reset" : "record carried over"}`;
  return base;
}

function MoveTeamDialog({
  open,
  onClose,
  teamId,
  teamName,
  orgId,
  entries,
  seasons,
  leagues,
  orgs,
  onDone
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  orgId: string;
  entries: TeamEntry[];
  seasons: SeasonOpt[];
  leagues: NamedOpt[];
  orgs: NamedOpt[];
  onDone: (r: TeamMovementResult) => void | Promise<void>;
}) {
  const liveEntries = useMemo(() => entries.filter((e) => LIVE.has(e.entryStatus)), [entries]);
  const canMoveOrg = orgs.length > 1;
  const [mode, setMode] = useState<Mode>("rollover");
  const [entryId, setEntryId] = useState(liveEntries[0]?.id ?? "");
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [copyRoster, setCopyRoster] = useState(true);
  const [standings, setStandings] = useState<"" | "reset" | "carry">("");
  const [targetOrgId, setTargetOrgId] = useState("");
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per dialog open: a retried submit returns the first result.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`
  );

  const entry = liveEntries.find((e) => e.id === entryId) ?? null;
  const openSeasons = seasons.filter((s) => s.status !== "completed" && s.status !== "archived");

  // Which season the division picker should list.
  const pickerSeasonId =
    mode === "rollover" ? seasonId : mode === "division_shift" ? entry?.seasonId ?? "" : seasonId;

  useEffect(() => {
    if (!open || !pickerSeasonId || mode === "org_move") {
      setDivisions([]);
      return;
    }
    let cancelled = false;
    setLoadingDivisions(true);
    leagueMgmt
      .listDivisions({ seasonId: pickerSeasonId, limit: 100 })
      .then((p) => {
        if (cancelled) return;
        setDivisions(
          p.items
            .filter((d) => d.status === "active")
            .filter((d) => (mode === "division_shift" ? d.id !== entry?.divisionId : true))
            .map((d) => ({ id: d.id, name: d.regionName ? `${d.regionName} · ${d.name}` : d.name }))
        );
      })
      .catch(() => {
        if (!cancelled) setDivisions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDivisions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pickerSeasonId, mode, entry?.divisionId]);

  function switchMode(m: Mode) {
    setMode(m);
    setSeasonId("");
    setLeagueId("");
    setDivisionId("");
    setStandings("");
    setError(null);
  }

  const ready =
    mode === "rollover"
      ? !!seasonId && !!divisionId
      : mode === "division_shift"
        ? !!entryId && !!divisionId && standings !== ""
        : mode === "league_migration"
          ? !!entryId && !!leagueId && !!seasonId && !!divisionId
          : !!targetOrgId;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reasonOrUndefined = reason.trim() || undefined;
      let r: TeamMovementResult;
      if (mode === "rollover") {
        r = await teamMovement.rollover(
          teamId,
          { targetDivisionId: divisionId, copyRoster, reason: reasonOrUndefined },
          idempotencyKey
        );
      } else if (mode === "division_shift") {
        r = await teamMovement.divisionShift(
          teamId,
          { entryId, targetDivisionId: divisionId, resetStandings: standings === "reset", reason: reasonOrUndefined },
          idempotencyKey
        );
      } else if (mode === "league_migration") {
        r = await teamMovement.leagueMigration(
          teamId,
          { entryId, targetDivisionId: divisionId, reason: reasonOrUndefined },
          idempotencyKey
        );
      } else {
        r = await teamMovement.orgMove(teamId, { targetOrgId, force, reason: reasonOrUndefined }, idempotencyKey);
      }
      await onDone(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const entryLabel = (e: TeamEntry) => `${e.seasonName} · ${e.divisionName} (${e.entryStatus.replace(/_/g, " ")})`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Move ${teamName}`}
      description="Past seasons are never changed. The current instance is closed and a new one is created, with a note of what still needs checking."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="What do you want to do" htmlFor="move-mode">
          <Select id="move-mode" value={mode} onChange={(e) => switchMode(e.target.value as Mode)}>
            {(Object.keys(MODE_LABELS) as Mode[])
              .filter((m) => m !== "org_move" || canMoveOrg)
              .map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
          </Select>
        </Field>

        {mode !== "rollover" && mode !== "org_move" ? (
          <Field label="Which season instance" htmlFor="move-entry">
            <Select id="move-entry" value={entryId} onChange={(e) => setEntryId(e.target.value)} required>
              {liveEntries.length === 0 ? <option value="">No live season instance</option> : null}
              {liveEntries.map((e) => (
                <option key={e.id} value={e.id}>
                  {entryLabel(e)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {mode === "league_migration" ? (
          <Field label="League" htmlFor="move-league" hint="Leagues of this organisation. Dues and roster rules differ per league and are flagged for review.">
            <Select
              id="move-league"
              value={leagueId}
              onChange={(e) => {
                setLeagueId(e.target.value);
                setSeasonId("");
                setDivisionId("");
              }}
              required
            >
              <option value="">Choose a league…</option>
              {leagues
                .filter((l) => l.id !== entry?.leagueId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}

        {mode === "rollover" || mode === "league_migration" ? (
          <Field
            label="Season"
            htmlFor="move-season"
            hint={mode === "rollover" ? "Only seasons that start after the team's current season are accepted." : undefined}
          >
            <Select
              id="move-season"
              value={seasonId}
              onChange={(e) => {
                setSeasonId(e.target.value);
                setDivisionId("");
              }}
              required
              disabled={mode === "league_migration" && !leagueId}
            >
              <option value="">Choose a season…</option>
              {openSeasons
                .filter((s) => (mode === "league_migration" ? s.leagueId === leagueId : true))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status.replace(/_/g, " ")}, starts {s.startDate})
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}

        {mode !== "org_move" ? (
          <Field
            label="Division"
            htmlFor="move-division"
            hint={
              loadingDivisions
                ? "Loading divisions…"
                : pickerSeasonId && divisions.length === 0
                  ? "No other active division in that season."
                  : undefined
            }
          >
            <Select
              id="move-division"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              required
              disabled={!pickerSeasonId || loadingDivisions}
            >
              <option value="">Choose a division…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {mode === "rollover" ? (
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <input type="checkbox" checked={copyRoster} onChange={(e) => setCopyRoster(e.target.checked)} />
            Copy the current active roster into the new season
          </label>
        ) : null}

        {mode === "division_shift" ? (
          <Field
            label="Standings"
            htmlFor="move-standings"
            hint="Only matters once games have been played. Player stats are never changed."
          >
            <Select
              id="move-standings"
              value={standings}
              onChange={(e) => setStandings(e.target.value as "" | "reset" | "carry")}
              required
            >
              <option value="">Choose…</option>
              <option value="reset">Start from 0-0-0 in the new division</option>
              <option value="carry">Carry the record over to the new division</option>
            </Select>
          </Field>
        ) : null}

        {mode === "org_move" ? (
          <>
            <Field label="Organisation" htmlFor="move-org" hint="Admins of the current organisation lose access to the team. Captain and coach roles stay.">
              <Select id="move-org" value={targetOrgId} onChange={(e) => setTargetOrgId(e.target.value)} required>
                <option value="">Choose an organisation…</option>
                {orgs
                  .filter((o) => o.id !== orgId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-fg">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Move even though the team is still playing in this organisation&apos;s seasons
            </label>
          </>
        ) : null}

        <Field label="Reason (optional)" htmlFor="move-reason">
          <Input
            id="move-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="Kept with the movement history"
          />
        </Field>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Moving…
              </>
            ) : (
              MODE_LABELS[mode]
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
