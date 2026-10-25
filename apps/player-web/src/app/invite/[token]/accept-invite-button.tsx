"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Button } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

export function AcceptInviteButton({
  token,
  teamName,
  canDecline = false
}: {
  token: string;
  teamName: string;
  /** Personal invites and free-agent offers can be declined (UC-03 / UC-04). */
  canDecline?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      await captain.acceptInvite(token);
      router.push("/team");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await captain.declineInvite(token);
      setDeclined(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (declined) {
    return (
      <Alert tone="info">
        You declined the {teamName} offer. The team has been told. You can close this page.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={accept} disabled={busy !== null}>
          {busy === "accept" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…
            </>
          ) : (
            `Join ${teamName}`
          )}
        </Button>
        {canDecline ? (
          <Button type="button" variant="ghost" onClick={decline} disabled={busy !== null}>
            {busy === "decline" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Declining…
              </>
            ) : (
              "Decline"
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
