"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button, Dialog, DialogActions } from "@sportspulse/ui";
import type { Person } from "@sportspulse/api-client";
import { captain, iam } from "@/lib/api/browser-api";

/**
 * Workflow 7B · Case 7 — guest player for a single game.
 *
 * Captain opens this from the schedule view's game detail. The guest is
 * written to game_attendance (is_guest=true) plus a roster_moves:guest_add
 * audit row. NO team_memberships write — guests don't count against the
 * cap and don't appear on the persistent roster.
 */
export function AddGuestModal({
  open,
  onClose,
  teamId,
  seasonId,
  gameId,
  opponentName,
  gameDate,
  onAdded
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  seasonId: string;
  gameId: string;
  opponentName?: string;
  gameDate?: string;
  onAdded: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"user" | "walkin">("user");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "user" || !q.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const page = await iam.listPersons({ search: q.trim(), limit: 6 });
        setResults(page.items);
      } catch (e) {
        console.error(e);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q, mode]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await captain.roster.guest(teamId, {
        seasonId,
        gameId,
        personId: mode === "user" ? picked?.id : undefined,
        guestName: mode === "walkin" ? walkInName.trim() : undefined
      });
      const label =
        mode === "user"
          ? `${picked?.legalFirstName ?? ""} ${picked?.legalLastName ?? ""}`.trim()
          : walkInName.trim();
      onAdded(`Added ${label} as a guest.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    ((mode === "user" && !!picked) ||
      (mode === "walkin" && walkInName.trim().length >= 2));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add guest player"
      description={
        opponentName || gameDate
          ? `vs ${opponentName ?? "TBD"}${gameDate ? ` · ${gameDate}` : ""}`
          : "Guests are added to this game's lineup only — they do not count against your roster cap."
      }
      size="lg"
    >
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setMode("user")}
          className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
            mode === "user"
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted"
          }`}
        >
          Search SportsPulse users
        </button>
        <button
          onClick={() => setMode("walkin")}
          className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
            mode === "walkin"
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted"
          }`}
        >
          Walk-in (non-user)
        </button>
      </div>

      <div className="space-y-3 pt-3">
        {mode === "user" ? (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              autoFocus
            />
            {results.length > 0 && !picked && (
              <ul className="divide-y divide-border rounded-md border border-border bg-surface-1">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-subtle"
                    >
                      <span className="text-sm font-medium text-fg">
                        {p.legalFirstName} {p.legalLastName}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-fg-muted">
                        {p.id.slice(0, 8)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picked && (
              <div className="flex items-center justify-between rounded-md border border-border bg-surface-1 px-3 py-2">
                <span className="text-sm font-medium text-fg">
                  {picked.legalFirstName} {picked.legalLastName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked(null)}
                >
                  Change
                </Button>
              </div>
            )}
          </>
        ) : (
          <input
            value={walkInName}
            onChange={(e) => setWalkInName(e.target.value)}
            placeholder="Guest's full name"
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            autoFocus
          />
        )}

        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // checks: max guests per game · per-player season limit · not on
          your active roster
        </p>

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" /> Add as guest
              </>
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
