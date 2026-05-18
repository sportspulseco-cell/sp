"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { registration } from "@/lib/api/browser-api";

/**
 * Player → captain "apply to join" button. Posts to
 * /me/team-join-requests (the existing player→captain flow).
 * After a successful POST we router.refresh() so the parent server
 * component re-fetches: the team disappears from the joinable list
 * and reappears under "awaiting captain approval".
 *
 * The API already handles dedup (one open request per
 * team+season) and "already on roster" — surface those messages
 * inline if they come back.
 */
export function JoinTeamButton({
  teamId,
  teamName,
  seasonId
}: {
  teamId: string;
  teamName: string;
  seasonId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (
      !confirm(
        `Apply to join ${teamName}? The captain will be notified and decide.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registration.applyToTeam({ teamId, seasonId });
      setDone(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
        <Check className="h-3 w-3" strokeWidth={2} />
        Application sent
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={apply} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <UserPlus className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
        )}
        Apply to join
      </Button>
      {error ? (
        <p className="max-w-[240px] text-right text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
