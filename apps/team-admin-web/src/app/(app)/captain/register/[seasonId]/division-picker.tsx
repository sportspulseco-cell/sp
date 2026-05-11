"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Users } from "lucide-react";
import { Badge, Button, Eyebrow } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

type Division = {
  id: string;
  name: string;
  tier: string | null;
  genderEligibility: string;
  maxTeams: number | null;
  currentTeamCount: number;
  pricing: {
    tierId: string;
    name: string;
    currency: string;
    fullPriceCents: number;
    paymentPlanEnabled: boolean;
    depositCents: number;
    installmentCount: number;
    installmentIntervalDays: number;
  } | null;
};

export function DivisionPicker({
  teamId,
  seasonId,
  divisions
}: {
  teamId: string;
  seasonId: string;
  divisions: Division[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await captain.applyToSeason({ teamId, seasonId, divisionId: picked });
      router.push("/captain/register");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 md:grid-cols-2">
        {divisions.map((d) => {
          const full = d.maxTeams != null && d.currentTeamCount >= d.maxTeams;
          const selected = picked === d.id;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => !full && setPicked(d.id)}
                disabled={full}
                className={`flex w-full flex-col gap-2 rounded-xl border p-5 text-left transition ${
                  full
                    ? "cursor-not-allowed border-border bg-bg-subtle text-fg-muted opacity-60"
                    : selected
                      ? "border-accent ring-2 ring-accent/40 bg-surface-1"
                      : "border-border bg-surface-1 hover:border-accent"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[16px] font-semibold tracking-tight text-fg">
                      {d.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      {d.tier ?? "—"} · {d.genderEligibility}
                    </p>
                  </div>
                  {full ? (
                    <Badge tone="danger" mono>
                      full
                    </Badge>
                  ) : (
                    <Badge tone={selected ? "success" : "neutral"} mono>
                      {selected ? "selected" : "pick"}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-fg-muted">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {d.currentTeamCount}
                    {d.maxTeams ? ` / ${d.maxTeams}` : ""} teams
                  </span>
                  {d.pricing && (
                    <span className="font-mono">
                      ${(d.pricing.fullPriceCents / 100).toFixed(2)} {d.pricing.currency}
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between rounded-xl border border-border bg-bg-subtle p-4">
        <div>
          <Eyebrow>// ready to apply?</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Your application is reviewed by a league admin before the
            roster + dues wizard unlocks.
          </p>
        </div>
        <Button onClick={apply} disabled={!picked || busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" /> Apply
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
