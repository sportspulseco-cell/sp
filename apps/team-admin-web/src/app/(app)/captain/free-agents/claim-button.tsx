"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import type { FreeAgentOffer } from "@sportspulse/api-client";
import { FREE_AGENT_OFFER_STATUS_LABELS } from "@sportspulse/kernel";
import { registrationV2 } from "@/lib/api/browser-api";

function fmtDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Offer a free agent a spot (UC-03, CAP-9). The player is not added to
 * the roster here: they get an email and an in-app card and accept or
 * decline. The row shows the stored offer the API returns ("Offer sent"),
 * without a reload; a declined or expired offer can be sent again.
 */
export function ClaimFreeAgentButton({
  entryId,
  teamId,
  teamName,
  playerName,
  seasonName,
  initialOffer
}: {
  entryId: string;
  teamId: string;
  teamName: string;
  playerName: string;
  seasonName: string | null;
  /** This team's latest offer to the player, from the server. */
  initialOffer: FreeAgentOffer | null;
}) {
  const router = useRouter();
  const [offer, setOffer] = useState<FreeAgentOffer | null>(initialOffer);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onOffer() {
    const season = seasonName ? ` for ${seasonName}` : "";
    if (
      !confirm(
        `Offer ${playerName} a spot on ${teamName}${season}? They get an email and decide. They join your roster only if they accept.`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await registrationV2.offerFreeAgent(entryId, { teamId });
      setOffer(res.offer);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (offer?.status === "pending") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge mono tone="info">
          {FREE_AGENT_OFFER_STATUS_LABELS.pending}
        </Badge>
        {offer.expiresAt ? (
          <span className="text-[10px] text-fg-muted">
            Waiting for the player · expires {fmtDay(offer.expiresAt)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {offer && offer.status !== "accepted" ? (
        <span className="text-[10px] text-fg-muted">
          Last offer: {FREE_AGENT_OFFER_STATUS_LABELS[offer.status].toLowerCase()}
        </span>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={onOffer} disabled={busy}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest">
          {offer ? "Offer again" : "Offer a spot"}
        </span>
      </Button>
      {err ? (
        <p role="alert" className="max-w-[28ch] text-right text-[10px] text-[var(--tint-rose-fg)]">
          {err}
        </p>
      ) : null}
    </div>
  );
}
