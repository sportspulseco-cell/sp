"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminDivisions } from "@/lib/api/browser-api";

interface SeasonOption {
  id: string;
  name: string;
  sportCode: string;
}

type Eligibility = "open" | "male" | "female" | "mixed";

const ELIGIBILITY: Array<{ value: Eligibility; label: string }> = [
  { value: "open", label: "Open" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "mixed", label: "Mixed / co-ed" }
];

export function NewDivisionForm({ seasons }: { seasons: SeasonOption[] }) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? "");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("");
  const [genderEligibility, setGenderEligibility] = useState<Eligibility>("open");
  const [maxTeams, setMaxTeams] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!seasonId) {
      setError("Pick a season.");
      return;
    }
    if (name.trim().length < 1) {
      setError("Division name is required.");
      return;
    }
    let maxTeamsNum: number | undefined;
    if (maxTeams.trim()) {
      maxTeamsNum = Number(maxTeams);
      if (!Number.isFinite(maxTeamsNum) || maxTeamsNum < 2) {
        setError("Max teams must be 2 or more.");
        return;
      }
    }
    setBusy(true);
    try {
      await orgAdminDivisions.create({
        seasonId,
        name: name.trim(),
        tier: tier.trim() || undefined,
        genderEligibility,
        maxTeams: maxTeamsNum
      });
      // Hard-nav so the list renders fresh data (BUG-038).
      window.location.replace("/divisions");
      return;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Details</Eyebrow>
      <Field label="Season">
        <select
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
          disabled={busy}
          className="flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.sportCode}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Division name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="A-Division"
          disabled={busy}
        />
      </Field>
      <Field label="Tier (optional)" hint="Free-text label, e.g. A / B / Premier.">
        <Input
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          placeholder="A"
          disabled={busy}
        />
      </Field>
      <Field label="Gender eligibility">
        <div className="flex flex-wrap gap-1.5">
          {ELIGIBILITY.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGenderEligibility(opt.value)}
              disabled={busy}
              className={
                "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (genderEligibility === opt.value
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Max teams (optional)" hint="Hard cap on division entries; blank = no cap.">
        <Input
          value={maxTeams}
          inputMode="numeric"
          onChange={(e) => setMaxTeams(e.target.value)}
          placeholder="8"
          disabled={busy}
        />
      </Field>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : null}
          Create division
        </Button>
      </div>
    </div>
  );
}
