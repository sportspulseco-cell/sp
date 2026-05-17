"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminSeasons } from "@/lib/api/browser-api";

interface LeagueOption {
  id: string;
  name: string;
  sportCode: string;
}

export function NewSeasonForm({ leagues }: { leagues: LeagueOption[] }) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [registrationOpensAt, setRegistrationOpensAt] = useState("");
  const [registrationClosesAt, setRegistrationClosesAt] = useState("");
  const [rosterLockAt, setRosterLockAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === leagueId) ?? null,
    [leagues, leagueId]
  );

  async function handleSubmit() {
    setError(null);
    if (!leagueId) {
      setError("Pick a league.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Season name is required.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    setBusy(true);
    try {
      await orgAdminSeasons.create({
        leagueId,
        name: name.trim(),
        startDate,
        endDate,
        registrationOpensAt: registrationOpensAt
          ? new Date(registrationOpensAt).toISOString()
          : undefined,
        registrationClosesAt: registrationClosesAt
          ? new Date(registrationClosesAt).toISOString()
          : undefined,
        rosterLockAt: rosterLockAt
          ? new Date(rosterLockAt).toISOString()
          : undefined
      });
      // Hard-nav so the list renders fresh data (BUG-038).
      window.location.replace("/seasons");
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
      <Field label="League">
        <select
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          disabled={busy}
          className="flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.sportCode}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Season name"
        hint={
          selectedLeague
            ? `Visible to captains and players in ${selectedLeague.name}.`
            : "Visible to captains and players."
        }
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spring 2026"
          disabled={busy}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start date">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={busy}
          />
        </Field>
      </div>

      <Eyebrow>// Registration window (optional)</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Registration opens">
          <Input
            type="datetime-local"
            value={registrationOpensAt}
            onChange={(e) => setRegistrationOpensAt(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Registration closes">
          <Input
            type="datetime-local"
            value={registrationClosesAt}
            onChange={(e) => setRegistrationClosesAt(e.target.value)}
            disabled={busy}
          />
        </Field>
      </div>
      <Field
        label="Roster lock"
        hint="After this date, captains can't add or drop players (defence-in-depth on top of the captain UI gate)."
      >
        <Input
          type="datetime-local"
          value={rosterLockAt}
          onChange={(e) => setRosterLockAt(e.target.value)}
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
          Create season
        </Button>
      </div>
    </div>
  );
}
