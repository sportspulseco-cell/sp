"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { registrationV2 } from "@/lib/api/browser-api";

export function ClaimFreeAgentButton({
  entryId,
  teamId
}: {
  entryId: string;
  teamId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClaim() {
    if (!confirm("Claim this player for your team? They'll be added to your roster for the season.")) return;
    setBusy(true);
    setErr(null);
    try {
      await registrationV2.placeFreeAgent(entryId, { teamId });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={onClaim} disabled={busy}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest">
          Claim
        </span>
      </Button>
      {err ? (
        <p className="text-[10px] text-rose-600 dark:text-rose-400">{err}</p>
      ) : null}
    </div>
  );
}
