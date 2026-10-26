"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { Alert, Button, Select } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

type Past = Awaited<ReturnType<typeof captain.roster.pastPlayers>>["items"][number];

const STATE_NOTE: Record<Past["state"], string> = {
  can_invite: "",
  on_roster: "Already on the roster",
  invited: "Invite already open",
  no_email: "No email on file"
};

/**
 * FR-3.4.3 / UC-04 "selects from past roster": pick players who were on
 * this team in earlier seasons and invite them to the chosen season in
 * one go. Each gets the same invite as one sent by email; players with no
 * season registration register onto the team from it.
 */
export function PastRosterInvite({
  teamId,
  seasons,
  defaultSeasonId
}: {
  teamId: string;
  seasons: Array<{ id: string; name: string }>;
  defaultSeasonId: string | null;
}) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(defaultSeasonId ?? seasons[0]?.id ?? "");
  const [items, setItems] = useState<Past[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    setItems(null);
    setPicked(new Set());
    captain.roster
      .pastPlayers(teamId, seasonId)
      .then((r) => !cancelled && setItems(r.items))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [teamId, seasonId]);

  async function send() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await captain.roster.inviteMany(teamId, { seasonId, personIds: [...picked] });
      const skipped = res.results.filter((r) => r.outcome !== "invited");
      setDone(
        `Invited ${res.invited} player${res.invited === 1 ? "" : "s"}.` +
          (skipped.length ? ` Skipped ${skipped.map((s) => s.name ?? "a player").join(", ")}.` : "")
      );
      setPicked(new Set());
      const again = await captain.roster.pastPlayers(teamId, seasonId);
      setItems(again.items);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (seasons.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="past-roster-invite">
      {seasons.length > 1 ? (
        <label className="grid max-w-xs gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Invite to season</span>
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      {items === null ? (
        <p className="text-[12px] text-fg-muted">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading past players…
        </p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-fg-muted">
          <Users className="mr-1 inline h-4 w-4" /> Nobody has played for this team in another season yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((p) => {
            const can = p.state === "can_invite";
            return (
              <li key={p.personId} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!can || busy}
                    checked={picked.has(p.personId)}
                    aria-label={`Invite ${p.name}`}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.personId);
                        else next.delete(p.personId);
                        return next;
                      })
                    }
                  />
                  <span className="font-medium text-fg">{p.name}</span>
                  <span className="text-fg-muted">
                    {p.lastSeasonName}
                    {p.lastJerseyNumber !== null ? ` · #${p.lastJerseyNumber}` : ""}
                  </span>
                </label>
                <span className="text-[12px] text-fg-muted">{STATE_NOTE[p.state]}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" onClick={send} disabled={picked.size === 0 || busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Invite {picked.size || ""} selected
      </Button>
    </div>
  );
}
