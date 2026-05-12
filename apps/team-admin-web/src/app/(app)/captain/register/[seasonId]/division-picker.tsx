"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Send,
  User,
  Users
} from "lucide-react";
import { Badge } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

type Division = {
  id: string;
  name: string;
  tier: string | null;
  genderEligibility: string;
  maxTeams: number | null;
  currentTeamCount: number;
  ageGroupLabel: string | null;
  gamesCount: number | null;
  perPlayerCostCents: number | null;
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

  const pickedDivision = useMemo(
    () => divisions.find((d) => d.id === picked) ?? null,
    [divisions, picked]
  );

  async function apply() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const { entry } = await captain.applyToSeason({
        teamId,
        seasonId,
        divisionId: picked
      });
      router.push(`/captain/register?submitted=${entry.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 md:grid-cols-2">
        {divisions.map((d) => (
          <li key={d.id}>
            <DivisionCard
              division={d}
              selected={picked === d.id}
              onPick={() => setPicked(d.id)}
            />
          </li>
        ))}
      </ul>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="sticky bottom-4 z-10 mt-6 flex flex-col gap-3 rounded-xl border border-border bg-surface-1/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-[13px]">
          {pickedDivision ? (
            <p className="text-fg-muted">
              Selected: <span className="font-semibold text-fg">{pickedDivision.name}</span>
              {pickedDivision.pricing && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-mono text-fg">
                    {formatMoney(
                      pickedDivision.pricing.fullPriceCents,
                      pickedDivision.pricing.currency
                    )}{" "}
                    per team
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-fg-muted">
              Pick a division to continue. Your application is reviewed by a league admin before the roster + dues wizard unlocks.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/captain/register"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-2 text-[13px] font-medium text-fg hover:bg-bg-subtle"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back
          </Link>
          <button
            type="button"
            onClick={apply}
            disabled={!picked || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            Apply for this division
          </button>
        </div>
      </div>
    </div>
  );
}

function DivisionCard({
  division,
  selected,
  onPick
}: {
  division: Division;
  selected: boolean;
  onPick: () => void;
}) {
  const max = division.maxTeams ?? 0;
  const current = division.currentTeamCount;
  const full = max > 0 && current >= max;
  const spotsLeft = max > 0 ? max - current : null;
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={() => !full && onPick()}
      disabled={full}
      className={[
        "relative flex w-full flex-col gap-3 rounded-xl border p-5 text-left transition",
        full
          ? "cursor-not-allowed border-border bg-bg-subtle opacity-70"
          : selected
            ? "border-accent bg-accent/5 ring-2 ring-accent/40"
            : "border-border bg-surface-1 hover:border-accent/60"
      ].join(" ")}
    >
      {selected && !full && (
        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}

      <div className="flex items-start justify-between gap-2 pr-7">
        <p className="text-[16px] font-semibold tracking-tight text-fg">
          {division.name}
        </p>
        {full ? (
          <Badge tone="danger" mono>
            full
          </Badge>
        ) : division.tier ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {division.tier}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <GenderIcon gender={division.genderEligibility} />
          {genderLabel(division.genderEligibility)}
        </span>
        {division.ageGroupLabel && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" strokeWidth={1.75} />
            {division.ageGroupLabel}
          </span>
        )}
        {division.gamesCount != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" strokeWidth={1.75} />
            {division.gamesCount} games
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="inline-flex items-center gap-1 text-fg-muted">
            <Users className="h-3 w-3" strokeWidth={1.75} />
            {max > 0 ? `${current} / ${max} teams` : `${current} teams`}
          </span>
          {spotsLeft != null && (
            <span
              className={
                full
                  ? "font-mono text-rose-600 dark:text-rose-400"
                  : "font-mono text-fg-muted"
              }
            >
              {full
                ? "0 spots left"
                : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}
            </span>
          )}
        </div>
        {max > 0 && (
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <div
              className={
                full
                  ? "h-full bg-rose-500/70"
                  : selected
                    ? "h-full bg-accent"
                    : "h-full bg-fg-muted/40"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {division.pricing && (
        <div>
          <p className="text-[15px] font-semibold text-fg">
            {formatMoney(
              division.pricing.fullPriceCents,
              division.pricing.currency
            )}{" "}
            <span className="text-[12px] font-normal text-fg-muted">
              per team
            </span>
          </p>
          {division.perPlayerCostCents != null && (
            <p className="mt-0.5 text-[12px] text-fg-muted">
              {formatMoney(
                division.perPlayerCostCents,
                division.pricing.currency
              )}{" "}
              per player
            </p>
          )}
        </div>
      )}
    </button>
  );
}

function GenderIcon({ gender }: { gender: string }) {
  const map: Record<string, string> = {
    male: "♂",
    female: "♀",
    mixed: "⚥",
    open: "⚥"
  };
  return (
    <span aria-hidden className="text-[14px] leading-none text-fg-muted">
      {map[gender] ?? "⚥"}
    </span>
  );
}

function genderLabel(gender: string) {
  switch (gender) {
    case "male":
      return "Men's";
    case "female":
      return "Women's";
    case "mixed":
      return "Mixed";
    default:
      return "Open";
  }
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(cents / 100);
}
