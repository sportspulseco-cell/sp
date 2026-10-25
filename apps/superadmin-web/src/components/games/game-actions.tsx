"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Flag,
  Loader2,
  Pause,
  Play,
  Send,
  X
} from "lucide-react";
import {
  GAME_ENDINGS,
  GAME_ENDING_LABELS,
  isValidTimeZone,
  utcToZonedWallTime,
  type GameEnding
} from "@sportspulse/kernel";
import type { GameReschedulePlan } from "@sportspulse/api-client";
import { gameOps, stats } from "@/lib/api/browser-api";
import type { Game } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useOrgRinks } from "./use-org-rinks";

/**
 * Game lifecycle actions. Each button shows only when the server says
 * this viewer may take that action (`game.viewerPermissions`, SCH-12),
 * so a league admin, scorekeeper or referee sees exactly what will work.
 */
export function GameActions({
  game,
  homeName,
  awayName,
  orgId,
  regulationPeriods
}: {
  game: Game;
  homeName: string;
  awayName: string;
  /** The league's organisation, for the rink picker. */
  orgId: string | null;
  /** Periods in regulation for this division (hockey default 3). */
  regulationPeriods: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scoreOpen, setScoreOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [stopping, setStopping] = useState<"postponed" | "cancelled" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const can = (p: string) => (game.viewerPermissions ?? []).includes(p);

  function withRefresh(fn: () => Promise<unknown>, done?: (r: unknown) => string | null) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (done) setNotice(done(r));
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const isTerminal =
    game.status === "completed" ||
    game.status === "cancelled" ||
    game.status === "forfeited";
  const isDraft = !game.publishedAt && !game.scheduleRunId && game.status !== "cancelled";
  const canMove = game.status === "scheduled" || game.status === "postponed";
  const nothingAllowed = (game.viewerPermissions ?? []).length === 0;

  return (
    <div className="space-y-3">
      {isDraft ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
          Draft. Captains and players do not see this game until it is published.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isDraft && can("game.publish") ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              withRefresh(
                () => gameOps.publishGame(game.id),
                (r) =>
                  `Published. ${(r as { notificationsQueued: number }).notificationsQueued} notices queued for both teams.`
              )
            }
            disabled={pending}
          >
            <Send className="mr-2 h-3.5 w-3.5" />
            Publish to team schedules
          </Button>
        ) : null}

        {game.status === "scheduled" && can("game.start") ? (
          <Button
            size="sm"
            variant={isDraft ? "outline" : "primary"}
            onClick={() => withRefresh(() => gameOps.startGame(game.id))}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-3.5 w-3.5" />
            )}
            Start play
          </Button>
        ) : null}

        {game.status === "in_play" ? (
          <>
            {can("score.write") ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScoreOpen(true)}
                disabled={pending}
              >
                Apply score
              </Button>
            ) : null}
            {can("game.finalize") ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setFinalizeOpen(true)}
                disabled={pending}
              >
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                Finalize
              </Button>
            ) : null}
          </>
        ) : null}

        {canMove && can("game.reschedule") ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMoveOpen(true)}
            disabled={pending}
          >
            <CalendarClock className="mr-2 h-3.5 w-3.5" />
            Reschedule
          </Button>
        ) : null}

        {game.status === "scheduled" || game.status === "in_play" ? (
          <>
            {can("game.postpone") ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStopping("postponed")}
                disabled={pending}
              >
                <Pause className="mr-2 h-3.5 w-3.5" />
                Postpone
              </Button>
            ) : null}
            {can("game.cancel") ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStopping("cancelled")}
                disabled={pending}
              >
                <X className="mr-2 h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
            {can("game.forfeit") ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  withRefresh(() =>
                    gameOps.forfeitGame(game.id, game.homeTeamId)
                  )
                }
                disabled={pending}
                title="Forfeit (home wins)"
              >
                <Flag className="mr-2 h-3.5 w-3.5" />
                Forfeit
              </Button>
            ) : null}
          </>
        ) : null}

        {(game.status === "completed" || game.status === "in_play") && can("stats.recompute") ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              withRefresh(
                () => stats.project(game.id, game.status === "in_play"),
                (r) => `Stats rebuilt: ${(r as { linesWritten: number }).linesWritten} player lines.`
              )
            }
            disabled={pending}
          >
            Project stats
          </Button>
        ) : null}

        {isTerminal && game.status !== "completed" ? (
          <span className="self-center font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            Terminal. No further actions.
          </span>
        ) : null}
        {nothingAllowed && !isTerminal ? (
          <span className="self-center text-[13px] text-fg-muted">
            Your role can view this game but not run it.
          </span>
        ) : null}
      </div>

      {notice ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <ApplyScoreDialog
        gameId={game.id}
        currentHome={game.homeScore}
        currentAway={game.awayScore}
        currentPeriod={game.period}
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
      />
      {finalizeOpen ? (
        <FinalizeDialog
          game={game}
          homeName={homeName}
          awayName={awayName}
          regulationPeriods={regulationPeriods}
          onClose={() => setFinalizeOpen(false)}
          onDone={(msg) => {
            setFinalizeOpen(false);
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
      {stopping ? (
        <StopGameDialog
          game={game}
          to={stopping}
          homeName={homeName}
          awayName={awayName}
          onClose={() => setStopping(null)}
          onDone={(msg) => {
            setStopping(null);
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
      {moveOpen ? (
        <RescheduleDialog
          game={game}
          orgId={orgId}
          onClose={() => setMoveOpen(false)}
          onDone={(msg) => {
            setMoveOpen(false);
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Postpone or cancel, after a check (MON-14): both teams of a published
 * game get a notice, so one stray click must not message two rosters.
 */
function StopGameDialog({
  game,
  to,
  homeName,
  awayName,
  onClose,
  onDone
}: {
  game: Game;
  to: "postponed" | "cancelled";
  homeName: string;
  awayName: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verb = to === "postponed" ? "Postpone" : "Cancel";
  const published = !!game.publishedAt;

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const r = to === "postponed" ? await gameOps.postponeGame(game.id) : await gameOps.cancelGame(game.id);
      const done = to === "postponed" ? "Postponed." : "Cancelled.";
      onDone(
        published
          ? `${done} ${r.notificationsQueued} notices queued for both teams.`
          : `${done} The game was a draft, so nobody was notified.`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${verb} ${awayName} at ${homeName}?`}
      description={
        to === "postponed"
          ? "The game comes off the schedule until you reschedule it."
          : "The game is cancelled for good. It cannot be restarted."
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg">
          {published
            ? "Players, captains and coaches of both teams get a notice."
            : "This game is a draft. Nobody has been told about it, so nobody is notified."}
        </p>
        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Keep the game
          </Button>
          <Button type="button" variant="primary" onClick={confirm} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {verb} game
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

/**
 * UC-12 review step: shows the final score with team names, asks how the
 * game ended (overtime and shootout losses earn a point), then one
 * server command locks the result, rebuilds stats and standings and
 * notifies both teams (SCH-17).
 */
function FinalizeDialog({
  game,
  homeName,
  awayName,
  regulationPeriods,
  onClose,
  onDone
}: {
  game: Game;
  homeName: string;
  awayName: string;
  regulationPeriods: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const tied = game.homeScore === game.awayScore;
  const options = GAME_ENDINGS.filter((e) => !(tied && e === "shootout"));
  // Default from the period the scorekeeper last recorded: past
  // regulation means overtime. Ties may leave it blank.
  const [endedIn, setEndedIn] = useState<GameEnding | "">(
    tied ? "" : game.period > regulationPeriods ? "overtime" : "regulation"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const r = await gameOps.finalizeGame(game.id, endedIn ? { endedIn } : {});
      const s = r.finalizeSummary;
      // Suspended players of either team served this game (COMP-10).
      const served = s.suspensionsServed
        ? ` ${s.suspensionsServed} suspension${s.suspensionsServed === 1 ? "" : "s"} counted this game${
            s.suspensionsCompleted ? `, ${s.suspensionsCompleted} now fully served` : ""
          }.`
        : "";
      // Players the league's discipline rules suspended from this game (COMP-11).
      const issued = s.suspensionsIssued
        ? ` ${s.suspensionsIssued} player${s.suspensionsIssued === 1 ? "" : "s"} suspended by the league's discipline rules.`
        : "";
      onDone(
        `Final. ${s.statLinesWritten} player stat ${s.statLinesWritten === 1 ? "line" : "lines"} saved, standings updated, ${s.notificationsQueued} notices queued for both teams.${served}${issued}`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Finalize game" description="Check the final score before you lock it.">
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">Away</p>
            <p className="text-sm font-semibold text-fg">{awayName}</p>
          </div>
          <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
            {game.awayScore} – {game.homeScore}
          </p>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">Home</p>
            <p className="text-sm font-semibold text-fg">{homeName}</p>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">
            How did the game end?{tied ? " (optional for a tie)" : ""}
          </legend>
          <div className="flex flex-wrap gap-2">
            {options.map((e) => (
              <label
                key={e}
                className={
                  "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm " +
                  (endedIn === e ? "border-fg bg-surface-2 text-fg" : "border-border text-fg-muted")
                }
              >
                <input
                  type="radio"
                  name="endedIn"
                  value={e}
                  checked={endedIn === e}
                  onChange={() => setEndedIn(e)}
                />
                {GAME_ENDING_LABELS[e]}
              </label>
            ))}
          </div>
          <details className="text-[12px] text-fg-muted">
            <summary className="cursor-pointer">What finalizing does</summary>
            <p className="mt-1">
              The score is locked. Player stats are rebuilt from the event log and the league
              standings are recalculated; an overtime or shootout loss earns one point. Both teams
              get a notice. The score must match the goals in the event log, and a shootout adds
              one goal to the winner.
            </p>
          </details>
        </fieldset>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={loading || (!tied && !endedIn)}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing…
              </>
            ) : (
              "Confirm final score"
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

/**
 * UC-07 manual override (SCH-6). Pick a new rink-local time and/or rink.
 * The server converts the time in the rink's zone, checks the same two
 * clashes the scheduler checks (rink double-booked, a team playing twice
 * at once), and refuses a clash unless the admin moves it anyway with a
 * reason. Published games notify both teams.
 */
function RescheduleDialog({
  game,
  orgId,
  onClose,
  onDone
}: {
  game: Game;
  orgId: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const gameTzValid = isValidTimeZone(game.tz);
  const [startLocal, setStartLocal] = useState(
    gameTzValid ? utcToZonedWallTime(game.scheduledStartTsUtc, game.tz) : ""
  );
  const [surfaceId, setSurfaceId] = useState("");
  const [reason, setReason] = useState("");
  const { rinks, error: rinkError } = useOrgRinks(orgId);
  const [plan, setPlan] = useState<GameReschedulePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenRink = rinks?.find((r) => r.surfaceId === surfaceId) ?? null;
  const currentRink = rinks?.find((r) => r.surfaceId === game.surfaceId) ?? null;
  const tzShown = chosenRink?.timezone ?? currentRink?.timezone ?? game.tz;
  const startChanged = gameTzValid
    ? startLocal !== utcToZonedWallTime(game.scheduledStartTsUtc, game.tz)
    : startLocal !== "";

  async function submit(force: boolean) {
    setLoading(true);
    setError(null);
    const body = {
      startLocal: startChanged || !gameTzValid ? startLocal || undefined : undefined,
      surfaceId: surfaceId || undefined
    };
    try {
      if (!force) {
        const p = await gameOps.previewReschedule(game.id, body);
        setPlan(p);
        if (p.conflicts.length > 0) return;
      }
      const r = await gameOps.rescheduleGame(game.id, {
        ...body,
        force: force || undefined,
        reason: reason.trim() || undefined
      });
      onDone(
        game.publishedAt
          ? `Moved. ${r.notificationsQueued} notices queued for both teams.`
          : "Moved. The game is a draft, so no one was notified."
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const conflicts = plan?.conflicts ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reschedule game"
      description="Move the game to a new time, a new rink, or both."
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date and time"
            htmlFor="startLocal"
            hint={`Rink time (${tzShown}).`}
          >
            <Input
              id="startLocal"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => {
                setStartLocal(e.target.value);
                setPlan(null);
              }}
            />
          </Field>
          <Field
            label="Rink"
            htmlFor="surfaceId"
            hint={
              rinkError ??
              (rinks === null
                ? "Loading rinks…"
                : rinks.length === 0
                  ? "No rinks set up for this organisation. Add them under Venues."
                  : undefined)
            }
          >
            <Select
              id="surfaceId"
              value={surfaceId}
              disabled={rinks === null}
              onChange={(e) => {
                setSurfaceId(e.target.value);
                setPlan(null);
              }}
            >
              <option value="">
                {game.venueName
                  ? `Keep ${game.venueName}${game.surfaceLabel ? ` · ${game.surfaceLabel}` : ""}`
                  : "Keep current rink"}
              </option>
              {(rinks ?? [])
                .filter((r) => r.surfaceId !== game.surfaceId)
                .map((r) => (
                  <option key={r.surfaceId} value={r.surfaceId}>
                    {r.label}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Field label="Reason" htmlFor="reason" hint="Required only to override a clash. Teams see it in the notice.">
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Rink A closed for resurfacing"
            maxLength={500}
          />
        </Field>

        {conflicts.length > 0 ? (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-300">
            <p className="font-medium">This move clashes:</p>
            <ul className="list-disc pl-5">
              {conflicts.map((c, i) => (
                <li key={`${c.gameId}-${i}`}>{c.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {conflicts.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => submit(true)}
              disabled={loading || !reason.trim()}
              title={reason.trim() ? undefined : "Add a reason to override"}
            >
              Move anyway
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => submit(false)}
            disabled={loading || (!startChanged && !surfaceId) || !startLocal}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
              </>
            ) : (
              "Move game"
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

function ApplyScoreDialog({
  gameId,
  currentHome,
  currentAway,
  currentPeriod,
  open,
  onClose
}: {
  gameId: string;
  currentHome: number;
  currentAway: number;
  currentPeriod: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [home, setHome] = useState(currentHome);
  const [away, setAway] = useState(currentAway);
  const [period, setPeriod] = useState(currentPeriod || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await gameOps.applyScore(gameId, { home, away, period });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Apply score"
      description="Update the running score and current period for this game."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Away" htmlFor="awayScore">
            <Input
              id="awayScore"
              type="number"
              min={0}
              value={away}
              onChange={(e) => setAway(Number(e.target.value))}
            />
          </Field>
          <Field label="Home" htmlFor="homeScore">
            <Input
              id="homeScore"
              type="number"
              min={0}
              value={home}
              onChange={(e) => setHome(Number(e.target.value))}
            />
          </Field>
          <Field label="Period" htmlFor="period">
            <Input
              id="period"
              type="number"
              min={1}
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            />
          </Field>
        </div>
        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Apply score"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
