"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Flag,
  Loader2,
  Pause,
  Play,
  X
} from "lucide-react";
import { gameOps, stats } from "@/lib/api/browser-api";
import type { Game } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function GameActions({ game }: { game: Game }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scoreOpen, setScoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function withRefresh(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {game.status === "scheduled" ? (
          <Button
            size="sm"
            variant="primary"
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setScoreOpen(true)}
              disabled={pending}
            >
              Apply score
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => withRefresh(() => gameOps.finalizeGame(game.id))}
              disabled={pending}
            >
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              Finalize
            </Button>
          </>
        ) : null}

        {game.status === "scheduled" || game.status === "in_play" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => withRefresh(() => gameOps.postponeGame(game.id))}
              disabled={pending}
            >
              <Pause className="mr-2 h-3.5 w-3.5" />
              Postpone
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => withRefresh(() => gameOps.cancelGame(game.id))}
              disabled={pending}
            >
              <X className="mr-2 h-3.5 w-3.5" />
              Cancel
            </Button>
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
          </>
        ) : null}

        {(game.status === "completed" || game.status === "in_play") ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              withRefresh(() =>
                stats.project(game.id, game.status === "in_play")
              )
            }
            disabled={pending}
          >
            Project stats
          </Button>
        ) : null}

        {isTerminal && game.status !== "completed" ? (
          <span className="self-center font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            Terminal — no further actions
          </span>
        ) : null}
      </div>

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
    </div>
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
