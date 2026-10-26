"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Alert, Button, Input } from "@sportspulse/ui";

/**
 * "Add a team" on a division page (SCH-4). Captains reach a division
 * through apply + approval; an admin needs a direct path when a team has
 * no captain yet or registered on paper. Picks from the organization's
 * teams that are not already in this division; the server refuses a team
 * that already plays in another division of the season and says what to
 * do instead.
 */
export function PlaceTeamControl({
  divisionName,
  teams,
  place
}: {
  divisionName: string;
  /** Candidate teams (the page leaves out teams already in this division). */
  teams: Array<{ id: string; name: string }>;
  place: (teamId: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? teams.filter((t) => t.name.toLowerCase().includes(q)) : teams;
    return list.slice(0, 50);
  }, [teams, query]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={teams.length === 0}>
          <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
          Add a team
        </Button>
        {teams.length === 0 ? (
          <span className="text-[12px] text-fg-muted">Every team of this organization is already here.</span>
        ) : null}
        {done ? <span className="text-[12px] text-fg-muted">{done}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg p-4">
      <p className="text-[13px] font-medium text-fg">Add a team to {divisionName}</p>
      <label className="block space-y-1">
        <span className="text-[12px] text-fg-muted">Team</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a team name"
          className="sm:max-w-sm"
          aria-label="Search teams"
        />
      </label>
      <ul className="max-h-56 overflow-y-auto rounded-md border border-border" role="listbox" aria-label="Teams">
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-[12px] text-fg-muted">No team matches "{query}".</li>
        ) : (
          matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={teamId === t.id}
                onClick={() => setTeamId(t.id)}
                className={
                  "block w-full px-3 py-2 text-left text-[13px] " +
                  (teamId === t.id ? "bg-surface-2 font-medium text-fg" : "text-fg hover:bg-surface-2")
                }
              >
                {t.name}
              </button>
            </li>
          ))
        )}
      </ul>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
            setTeamId("");
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!teamId || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await place(teamId);
              const name = teams.find((t) => t.id === teamId)?.name ?? "The team";
              setDone(`${name} is now in ${divisionName}.`);
              setOpen(false);
              setTeamId("");
              setQuery("");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Add to division
        </Button>
      </div>
    </div>
  );
}
