"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { roster } from "@/lib/api/browser-api";

/**
 * Captain-side drop. Posts a roster_moves drop event — same handler
 * super_admin uses, just authorized via the captain's team scope.
 */
export function DropPlayerButton({
  teamId,
  personId,
  seasonId
}: {
  teamId: string;
  personId: string;
  seasonId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDrop() {
    if (!confirm("Drop this player from the roster? They'll keep prior stats.")) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await roster.drop({ teamId, personId, seasonId });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDrop}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserMinus className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest">
          Drop
        </span>
      </Button>
      {err ? (
        <p className="text-[10px] text-rose-600 dark:text-rose-400">{err}</p>
      ) : null}
    </div>
  );
}
