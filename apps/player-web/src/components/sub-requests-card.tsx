"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Users, X } from "lucide-react";
import { Alert, Button, Eyebrow } from "@sportspulse/ui";
import type { SubRequest } from "@sportspulse/api-client";
import { subs } from "@/lib/api/browser-api";

/**
 * Sub requests waiting for the player's answer (UC-31). A captain asked
 * them to sub for one game. Accept puts them on that game's lineup as a
 * guest (the server re-checks eligibility first); Decline tells the
 * captain. Each answer replaces the row with what the API returned.
 * Renders nothing when there is nothing to answer.
 */
export function SubRequestsCard({ items }: { items: SubRequest[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<SubRequest[]>(items);
  const [answered, setAnswered] = useState<SubRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (open.length === 0 && answered.length === 0) return null;

  async function answer(r: SubRequest, kind: "accept" | "decline") {
    setBusy(`${r.id}:${kind}`);
    setError(null);
    try {
      const res = kind === "accept" ? await subs.accept(r.id) : await subs.decline(r.id);
      setOpen((prev) => prev.filter((p) => p.id !== r.id));
      setAnswered((prev) => [...prev, res.request]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Sub requests" className="rounded-xl border border-accent/30 bg-accent/[0.04] p-5">
      <Eyebrow>Sub requests</Eyebrow>
      {open.length > 0 ? (
        <p className="mt-1 text-[13px] text-fg-muted">
          {open.length === 1 ? "A captain asks you to sub for one game." : `${open.length} captains ask you to sub.`}
        </p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <ul className="mt-3 space-y-2">
        {answered.map((a) => (
          <li key={`a-${a.id}`} className="rounded-md border border-border bg-bg px-4 py-3 text-[13px] text-fg">
            {a.status === "accepted"
              ? `You are on the ${a.teamName} lineup for ${a.game.when}.`
              : `You declined the ${a.teamName} request. The captain is told.`}
          </li>
        ))}
        {open.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-fg">
                <Users className="mr-1.5 inline h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
                {r.teamName} vs {r.game.opponentName}
              </p>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                {r.game.when}
                {r.game.venueName ? ` · ${r.game.venueName}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => answer(r, "accept")} disabled={busy !== null}>
                {busy === `${r.id}:accept` ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                )}
                Accept
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => answer(r, "decline")} disabled={busy !== null}>
                {busy === `${r.id}:decline` ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                )}
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
