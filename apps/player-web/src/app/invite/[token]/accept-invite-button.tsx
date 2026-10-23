"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Button } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

export function AcceptInviteButton({
  token,
  teamName
}: {
  token: string;
  teamName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await captain.acceptInvite(token);
      router.push("/team");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="button" onClick={accept} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…
          </>
        ) : (
          `Join ${teamName}`
        )}
      </Button>
    </div>
  );
}
