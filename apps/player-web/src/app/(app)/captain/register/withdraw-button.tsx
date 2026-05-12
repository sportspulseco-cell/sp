"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

export function WithdrawButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onWithdraw() {
    if (!confirm("Withdraw your application? You can apply again later.")) return;
    setBusy(true);
    setError(null);
    try {
      await captain.withdrawApplication(entryId);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" onClick={onWithdraw} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
        Withdraw
      </Button>
      {error && (
        <p className="text-[11px] text-rose-700 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}
