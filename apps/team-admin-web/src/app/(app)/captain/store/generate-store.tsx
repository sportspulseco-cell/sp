"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Alert, Button, Eyebrow, Input } from "@sportspulse/ui";
import { STORE_GENERATE_ITEMS, STORE_KIND_LABELS } from "@sportspulse/kernel";
import { teamStore } from "@/lib/api/browser-api";

type Kind = "jersey" | "hoodie" | "cap";

/**
 * UC-25 "Generate team store": the team's jersey, hoodie and cap with
 * the player's name and number on the back where it fits. The captain
 * sets each price; nothing is priced for them. Items already generated
 * are not offered again.
 */
export function GenerateStore({
  teamId,
  existingKinds,
  onDone
}: {
  teamId: string;
  existingKinds: string[];
  onDone: (message: string) => Promise<void>;
}) {
  const offer = STORE_GENERATE_ITEMS.filter((g) => g.kind !== "custom" && !existingKinds.includes(g.kind));
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(offer.map((g) => [g.kind, true])));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (offer.length === 0) return null;

  const chosen = offer.filter((g) => picked[g.kind]);
  const cents = (k: string) => Math.round(Number(prices[k] ?? "") * 100);
  const missing = chosen.find((g) => !(cents(g.kind) >= 1));

  async function generate() {
    if (missing) {
      setError(`Set a price for the ${STORE_KIND_LABELS[missing.kind].toLowerCase()}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await teamStore.generate(teamId, {
        items: chosen.map((g) => ({ kind: g.kind as Kind, priceCents: cents(g.kind) })),
        tellPlayers: tell
      });
      await onDone(
        `Added ${r.created.join(", ").toLowerCase() || "nothing new"} to the store.` +
          (r.playersTold ? ` ${r.playersTold} player${r.playersTold === 1 ? "" : "s"} told.` : "")
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
      <div>
        <Eyebrow>Generate from the roster</Eyebrow>
        <p className="mt-1 text-sm text-fg-muted">
          Adds the team&apos;s gear in one step. Players pick a size, and their name and number from the roster are
          filled in for the back.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {offer.map((g) => {
          const label = STORE_KIND_LABELS[g.kind];
          const back = [g.personalization.name ? "name" : null, g.personalization.number ? "number" : null].filter(Boolean).join(" and ");
          return (
            <li key={g.kind} className="space-y-2 rounded-lg border border-border bg-bg-subtle p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-fg">
                <input
                  type="checkbox"
                  checked={!!picked[g.kind]}
                  onChange={(e) => setPicked((p) => ({ ...p, [g.kind]: e.target.checked }))}
                />
                {label}
              </label>
              <p className="text-[12px] text-fg-muted">
                {g.sizes.length ? `Sizes ${g.sizes[0]} to ${g.sizes[g.sizes.length - 1]}` : "One size"}
                {back ? ` · ${back} on the back` : ""}
              </p>
              <label className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Price (USD)</span>
                <Input
                  aria-label={`${label} price`}
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={!picked[g.kind]}
                  value={prices[g.kind] ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [g.kind]: e.target.value }))}
                />
              </label>
            </li>
          );
        })}
      </ul>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
        Email the players on the roster that the store is open
      </label>
      {error ? (
        <Alert tone="error">
          {error}
        </Alert>
      ) : null}
      <Button onClick={generate} disabled={busy || chosen.length === 0}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-2 h-4 w-4" /> Generate store</>}
      </Button>
    </section>
  );
}
