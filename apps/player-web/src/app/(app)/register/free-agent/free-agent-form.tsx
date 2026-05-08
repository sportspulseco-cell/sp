"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShieldCheck, Star } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import type { FreeAgentPoolEntry, Season } from "@sportspulse/api-client";
import { registrationV2 } from "@/lib/api/browser-api";

const POSITIONS: { value: string; label: string }[] = [
  { value: "forward", label: "Forward" },
  { value: "defense", label: "Defense" },
  { value: "goalie", label: "Goalie" }
];

const LEVELS: { value: "A" | "B" | "C" | "D"; label: string; hint: string }[] = [
  { value: "A", label: "Elite", hint: "Junior / college / former pro" },
  { value: "B", label: "Competitive", hint: "Travel + adult competitive league" },
  { value: "C", label: "Recreational", hint: "Casual league regular" },
  { value: "D", label: "Beginner", hint: "Just learning the game" }
];

const DAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun"
] as const;

const TIME_WINDOWS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
  { value: "EVE", label: "Eve" }
];

type Availability = Record<string, string[]>;

export function FreeAgentForm({
  personId,
  seasons,
  existingEntries
}: {
  personId: string;
  seasons: Season[];
  existingEntries: FreeAgentPoolEntry[];
}) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState<string>(() => seasons[0]?.id ?? "");
  const existing = useMemo(
    () => existingEntries.find((e) => e.seasonId === seasonId) ?? null,
    [existingEntries, seasonId]
  );
  const placed = existing?.status === "placed";

  const [positions, setPositions] = useState<string[]>([]);
  const [levelPrimary, setLevelPrimary] = useState<"A" | "B" | "C" | "D">("C");
  const [flex, setFlex] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Availability>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Pre-populate when an existing entry is loaded for the chosen season.
  useEffect(() => {
    if (!existing) {
      setPositions([]);
      setLevelPrimary("C");
      setFlex([]);
      setAvailability({});
      setNote("");
      return;
    }
    setPositions(existing.positions ?? []);
    setLevelPrimary(
      (existing.levelPrimary as "A" | "B" | "C" | "D") ?? "C"
    );
    setFlex(existing.levelFlexibility ?? []);
    setAvailability(
      sanitiseAvailability(existing.availability ?? {})
    );
    setNote(existing.note ?? "");
  }, [existing]);

  function togglePosition(value: string) {
    setPositions((p) =>
      p.includes(value) ? p.filter((x) => x !== value) : [...p, value]
    );
  }
  function toggleFlex(value: string) {
    setFlex((p) =>
      p.includes(value) ? p.filter((x) => x !== value) : [...p, value]
    );
  }
  function toggleSlot(day: string, slot: string) {
    setAvailability((prev) => {
      const cur = prev[day] ?? [];
      const next = cur.includes(slot)
        ? cur.filter((x) => x !== slot)
        : [...cur, slot];
      return { ...prev, [day]: next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!seasonId) {
      setError("Pick a season first");
      return;
    }
    if (positions.length === 0) {
      setError("Pick at least one position");
      return;
    }
    setBusy(true);
    try {
      await registrationV2.upsertFreeAgentEntry({
        playerPersonId: personId,
        seasonId,
        positions,
        availability: stripEmptyDays(availability) as Record<string, unknown>,
        levelPrimary,
        levelFlexibility: flex.length > 0 ? flex : undefined,
        note: note.trim() ? note.trim() : undefined
      });
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    return (
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              // Placed
            </p>
            <p className="text-[14px] font-medium text-fg">
              You've been picked up by a team
            </p>
            <p className="text-[12px] text-fg-muted">
              Your free-agent listing is now hidden from captains. Pick a different
              season above to advertise for another season.
            </p>
          </div>
        </div>
        {seasons.length > 1 ? (
          <SeasonPicker
            seasons={seasons}
            value={seasonId}
            onChange={setSeasonId}
            existingEntries={existingEntries}
          />
        ) : null}
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-xl border border-border bg-surface-1 p-6"
    >
      <SeasonPicker
        seasons={seasons}
        value={seasonId}
        onChange={setSeasonId}
        existingEntries={existingEntries}
      />

      <fieldset>
        <Eyebrow>Positions</Eyebrow>
        <p className="mb-2 text-[12px] text-fg-muted">
          Pick every position you'd play. Order doesn't matter — captains see
          the full list.
        </p>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => {
            const selected = positions.includes(p.value);
            return (
              <button
                type="button"
                key={p.value}
                onClick={() => togglePosition(p.value)}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  selected
                    ? "border-accent bg-accent text-bg"
                    : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted"
                }`}
              >
                {selected ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                ) : null}
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <Eyebrow>Primary level</Eyebrow>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {LEVELS.map((lvl) => {
            const selected = levelPrimary === lvl.value;
            return (
              <button
                type="button"
                key={lvl.value}
                onClick={() => setLevelPrimary(lvl.value)}
                className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-bg-subtle hover:border-fg-muted"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? "border-accent bg-accent text-bg"
                      : "border-border"
                  }`}
                >
                  {selected ? (
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  ) : (
                    <span className="font-mono text-[10px]">{lvl.value}</span>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-fg">
                    {lvl.label}
                  </span>
                  <span className="block text-[11px] text-fg-muted">
                    {lvl.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <Eyebrow>Level flexibility (optional)</Eyebrow>
        <p className="mb-2 text-[12px] text-fg-muted">
          Other levels you'd play if there's no team at your primary. Captains
          searching adjacent levels will see you.
        </p>
        <div className="flex flex-wrap gap-2">
          {LEVELS.filter((l) => l.value !== levelPrimary).map((lvl) => {
            const selected = flex.includes(lvl.value);
            return (
              <button
                type="button"
                key={lvl.value}
                onClick={() => toggleFlex(lvl.value)}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  selected
                    ? "border-accent bg-accent text-bg"
                    : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted"
                }`}
              >
                {lvl.value} · {lvl.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <Eyebrow>Availability</Eyebrow>
        <p className="mb-2 text-[12px] text-fg-muted">
          Tap the time-of-day windows you can play. Leave a row empty if that
          day doesn't work.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                <th className="py-1 pr-3 text-left">Day</th>
                {TIME_WINDOWS.map((w) => (
                  <th key={w.value} className="px-2 py-1 text-center">
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr key={day} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-[12px] text-fg">{day}</td>
                  {TIME_WINDOWS.map((w) => {
                    const slots = availability[day] ?? [];
                    const selected = slots.includes(w.value);
                    return (
                      <td key={w.value} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSlot(day, w.value)}
                          className={`h-7 w-12 rounded-md border font-mono text-[10px] uppercase ${
                            selected
                              ? "border-accent bg-accent text-bg"
                              : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted"
                          }`}
                          aria-label={`${day} ${w.label}`}
                        >
                          {selected ? "✓" : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset>
        <Eyebrow>Note (optional)</Eyebrow>
        <p className="mb-2 text-[12px] text-fg-muted">
          One short line captains see — e.g. "available May 12 onward" or
          "skating since 2002".
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={2}
          maxLength={280}
          placeholder="Anything captains should know"
          className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {note.length}/280
        </p>
      </fieldset>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          {existing ? "Entry updated." : "You're in the pool — captains can see you now."}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {existing ? (
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3 w-3" strokeWidth={2} />
              Editing existing entry
            </span>
          ) : (
            "New entry"
          )}
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            {existing ? "Update entry" : "Join the pool"}
          </span>
        </Button>
      </div>
    </form>
  );
}

function SeasonPicker({
  seasons,
  value,
  onChange,
  existingEntries
}: {
  seasons: Season[];
  value: string;
  onChange: (id: string) => void;
  existingEntries: FreeAgentPoolEntry[];
}) {
  return (
    <fieldset>
      <Eyebrow>Season</Eyebrow>
      <p className="mb-2 text-[12px] text-fg-muted">
        One entry per season. Switching seasons loads any prior entry for that
        season — edits overwrite in place.
      </p>
      <div className="flex flex-wrap gap-2">
        {seasons.map((s) => {
          const selected = s.id === value;
          const entry = existingEntries.find((e) => e.seasonId === s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`flex h-9 items-center gap-2 rounded-md border px-3 text-[12px] transition-colors ${
                selected
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted"
              }`}
            >
              <span>{s.name}</span>
              {entry ? (
                <Badge mono tone={entry.status === "placed" ? "success" : "info"}>
                  {entry.status}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
      // {children}
    </p>
  );
}

function sanitiseAvailability(av: Record<string, unknown>): Availability {
  const out: Availability = {};
  for (const [k, v] of Object.entries(av)) {
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

function stripEmptyDays(av: Availability): Availability {
  const out: Availability = {};
  for (const [k, v] of Object.entries(av)) {
    if (v.length > 0) out[k] = v;
  }
  return out;
}
