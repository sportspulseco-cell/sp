"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { registrationV2 } from "@/lib/api/browser-api";

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRevoke() {
    if (!confirm("Revoke this invite? The recipient will no longer be able to use it.")) return;
    setBusy(true);
    try {
      await registrationV2.revokeTeamInvite(inviteId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onRevoke}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest">
        Revoke
      </span>
    </Button>
  );
}
