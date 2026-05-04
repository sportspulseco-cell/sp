"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { gameOps, iam, roster } from "@/lib/api/browser-api";
import type { Person } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const HOCKEY_TYPES = [
  "goal",
  "assist",
  "save",
  "penalty",
  "shot",
  "faceoff_won",
  "block",
  "hit"
];
const SOCCER_TYPES = [
  "goal",
  "assist",
  "yellow_card",
  "red_card",
  "save",
  "shot"
];
const GENERIC_TYPES = ["score", "event", "note"];

function typesForSport(sportCode: string): string[] {
  if (sportCode === "HOCKEY_ICE") return HOCKEY_TYPES;
  if (sportCode === "SOCCER") return SOCCER_TYPES;
  return [...GENERIC_TYPES];
}

interface TeamLite {
  id: string;
  label: string;
}

export function AppendEventButton({
  gameId,
  sportCode,
  homeTeam,
  awayTeam
}: {
  gameId: string;
  sportCode: string;
  homeTeam: TeamLite;
  awayTeam: TeamLite;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Log event
      </Button>
      {open ? (
        <AppendDialog
          gameId={gameId}
          sportCode={sportCode}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AppendDialog({
  gameId,
  sportCode,
  homeTeam,
  awayTeam,
  onClose
}: {
  gameId: string;
  sportCode: string;
  homeTeam: TeamLite;
  awayTeam: TeamLite;
  onClose: () => void;
}) {
  const router = useRouter();
  const types = typesForSport(sportCode);
  const [form, setForm] = useState({
    eventType: types[0] ?? "event",
    teamId: homeTeam.id,
    primaryPersonId: "",
    period: 1,
    clockRemainingSec: ""
  });
  const [persons, setPersons] = useState<Person[]>([]);
  const [personsLoading, setPersonsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefer rostered players for the selected team, fall back to all persons.
  useEffect(() => {
    let cancelled = false;
    setPersonsLoading(true);
    setForm((f) => ({ ...f, primaryPersonId: "" }));
    (async () => {
      try {
        const memberships = await roster.listMemberships({
          teamId: form.teamId,
          activeOnly: true
        });
        const personIds = new Set(memberships.items.map((m) => m.personId));
        const all = await iam.listPersons({ limit: 200 });
        const rostered = all.items.filter((p) => personIds.has(p.id));
        if (cancelled) return;
        setPersons(rostered.length > 0 ? rostered : all.items);
      } catch {
        if (cancelled) return;
        setPersons([]);
      } finally {
        if (!cancelled) setPersonsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.teamId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await gameOps.appendEvent({
        gameId,
        eventType: form.eventType,
        teamId: form.teamId,
        primaryPersonId: form.primaryPersonId || undefined,
        period: Number(form.period),
        clockRemainingSec: form.clockRemainingSec
          ? Number(form.clockRemainingSec)
          : undefined,
        idempotencyKey: crypto.randomUUID()
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Log game event"
      description="Append an immutable event to the game's append-only log. Events feed the stat reducer."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Event type" htmlFor="eventType">
          <Select
            id="eventType"
            required
            value={form.eventType}
            onChange={(e) => setForm({ ...form, eventType: e.target.value })}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Team" htmlFor="teamId">
          <Select
            id="teamId"
            value={form.teamId}
            onChange={(e) => setForm({ ...form, teamId: e.target.value })}
          >
            <option value={awayTeam.id}>{awayTeam.label} (away)</option>
            <option value={homeTeam.id}>{homeTeam.label} (home)</option>
          </Select>
        </Field>
        <Field
          label="Player"
          htmlFor="primaryPersonId"
          hint={
            personsLoading
              ? "Loading roster…"
              : persons.length === 0
                ? "No persons found — leave blank for non-attributed events."
                : "Optional — leave blank for team-level events (e.g. timeouts)."
          }
        >
          <Select
            id="primaryPersonId"
            disabled={personsLoading}
            value={form.primaryPersonId}
            onChange={(e) =>
              setForm({ ...form, primaryPersonId: e.target.value })
            }
          >
            <option value="">— No specific player —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Period" htmlFor="period">
            <Input
              id="period"
              type="number"
              min={1}
              value={form.period}
              onChange={(e) =>
                setForm({ ...form, period: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Clock remaining (s)" htmlFor="clockRemainingSec">
            <Input
              id="clockRemainingSec"
              type="number"
              min={0}
              value={form.clockRemainingSec}
              onChange={(e) =>
                setForm({ ...form, clockRemainingSec: e.target.value })
              }
              placeholder="Optional"
            />
          </Field>
        </div>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Logging…
              </>
            ) : (
              "Log event"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
