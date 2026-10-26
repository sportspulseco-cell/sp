"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  EJECTION_LABELS,
  EJECTION_TYPES,
  HOCKEY_INFRACTIONS,
  HOCKEY_PENALTY_MINUTES,
  HOCKEY_PENALTY_MINUTE_LABELS,
  HOCKEY_SCORESHEET_EVENT_TYPES,
  HOCKEY_SPORT_CODE,
  validateHockeyEvent
} from "@sportspulse/kernel";
import { gameOps } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@sportspulse/ui";

// Assists ride on the goal (Assist 1 / Assist 2), never as their own
// event, so each one is counted once (SCH-13). Penalties carry an
// infraction and minutes (SCH-14). Both lists come from the kernel, the
// same rules the API enforces.
const SOCCER_TYPES = ["goal", "assist", "yellow_card", "red_card", "save", "shot"];
const GENERIC_TYPES = ["score", "event", "note"];

function typesForSport(sportCode: string): string[] {
  if (sportCode === HOCKEY_SPORT_CODE) return [...HOCKEY_SCORESHEET_EVENT_TYPES];
  if (sportCode === "SOCCER") return SOCCER_TYPES;
  return [...GENERIC_TYPES];
}

interface TeamLite {
  id: string;
  label: string;
}

/** One player the scoresheet may name (GET /games/:id/players). */
interface Pickable {
  id: string;
  name: string;
  jerseyNumber: number | null;
  guest: boolean;
}

function personName(p: Pickable): string {
  const num = p.jerseyNumber !== null ? `#${p.jerseyNumber} ` : "";
  return `${num}${p.name}${p.guest ? " (guest)" : ""}`;
}

export function AppendEventButton({
  gameId,
  sportCode,
  seasonId,
  homeTeam,
  awayTeam
}: {
  gameId: string;
  sportCode: string;
  /** The game's season: the picker lists that season's roster only. */
  seasonId: string | null;
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
          seasonId={seasonId}
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
  seasonId,
  homeTeam,
  awayTeam,
  onClose
}: {
  gameId: string;
  sportCode: string;
  seasonId: string | null;
  homeTeam: TeamLite;
  awayTeam: TeamLite;
  onClose: () => void;
}) {
  const router = useRouter();
  const types = typesForSport(sportCode);
  const isHockey = sportCode === HOCKEY_SPORT_CODE;
  const [form, setForm] = useState({
    eventType: types[0] ?? "event",
    teamId: homeTeam.id,
    primaryPersonId: "",
    assist1: "",
    assist2: "",
    infraction: "",
    minutes: "",
    ejection: "",
    period: 1,
    clockRemainingSec: ""
  });
  const [persons, setPersons] = useState<Pickable[]>([]);
  const [personsLoading, setPersonsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the selected team's active roster for the game's season, the
  // same set the API accepts (SCH-22).
  useEffect(() => {
    let cancelled = false;
    setPersonsLoading(true);
    setForm((f) => ({ ...f, primaryPersonId: "", assist1: "", assist2: "" }));
    (async () => {
      try {
        // The game's own player list: the team's roster for the game's
        // season plus guests checked in to this game. Works for a
        // scorekeeper whose role covers only this game.
        const teams = await gameOps.gamePlayers(gameId);
        const rostered: Pickable[] = (teams.find((t) => t.teamId === form.teamId)?.players ?? []).map((p) => ({
          id: p.personId,
          name: p.name,
          jerseyNumber: p.jerseyNumber,
          guest: p.guest
        }));
        if (cancelled) return;
        setPersons(rostered);
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
  }, [form.teamId, gameId]);

  const isGoal = form.eventType === "goal";
  const isPenalty = form.eventType === "penalty";
  const showAssists = isHockey && isGoal;
  const showPenalty = isHockey && isPenalty;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const secondaryPersonIds = showAssists
      ? [form.assist1, form.assist2].filter((id) => id !== "")
      : [];
    const attributes = showPenalty
      ? {
          infraction: form.infraction,
          minutes: Number(form.minutes),
          // Ejections drive the automatic suspension rules (COMP-11).
          ...(form.ejection ? { ejection: form.ejection } : {})
        }
      : undefined;
    if (isHockey) {
      const problem = validateHockeyEvent({
        eventType: form.eventType,
        teamId: form.teamId,
        primaryPersonId: form.primaryPersonId || null,
        secondaryPersonIds,
        attributes: attributes ?? {}
      });
      if (problem) {
        setError(problem);
        return;
      }
    }
    setLoading(true);
    try {
      await gameOps.appendEvent({
        gameId,
        eventType: form.eventType,
        teamId: form.teamId,
        primaryPersonId: form.primaryPersonId || undefined,
        secondaryPersonIds: secondaryPersonIds.length ? secondaryPersonIds : undefined,
        attributes,
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

  const personOptions = (exclude: string[]) =>
    persons
      .filter((p) => !exclude.includes(p.id))
      .map((p) => (
        <option key={p.id} value={p.id}>
          {personName(p)}
        </option>
      ));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Log game event"
      description="Each event is kept in the game's log and feeds player stats."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Event type" htmlFor="eventType">
          <Select
            id="eventType"
            required
            value={form.eventType}
            onChange={(e) =>
              setForm({ ...form, eventType: e.target.value, assist1: "", assist2: "" })
            }
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
                ? "This team has no active players on this season's roster. Leave blank for a team-level event."
                : isGoal
                  ? "The goal scorer. Leave blank only if the scorer is unknown."
                  : "Optional. Leave blank for team-level events (bench minor, timeout)."
          }
        >
          <Select
            id="primaryPersonId"
            disabled={personsLoading}
            value={form.primaryPersonId}
            onChange={(e) =>
              setForm({
                ...form,
                primaryPersonId: e.target.value,
                assist1: form.assist1 === e.target.value ? "" : form.assist1,
                assist2: form.assist2 === e.target.value ? "" : form.assist2
              })
            }
          >
            <option value="">No specific player</option>
            {personOptions([])}
          </Select>
        </Field>

        {showAssists ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assist 1" htmlFor="assist1">
              <Select
                id="assist1"
                disabled={personsLoading || !form.primaryPersonId}
                value={form.assist1}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assist1: e.target.value,
                    assist2: e.target.value ? form.assist2 : ""
                  })
                }
              >
                <option value="">Unassisted</option>
                {personOptions([form.primaryPersonId, form.assist2])}
              </Select>
            </Field>
            <Field label="Assist 2" htmlFor="assist2">
              <Select
                id="assist2"
                disabled={personsLoading || !form.assist1}
                value={form.assist2}
                onChange={(e) => setForm({ ...form, assist2: e.target.value })}
              >
                <option value="">None</option>
                {personOptions([form.primaryPersonId, form.assist1])}
              </Select>
            </Field>
          </div>
        ) : null}

        {showPenalty ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Infraction" htmlFor="infraction">
              <Select
                id="infraction"
                required
                value={form.infraction}
                onChange={(e) => setForm({ ...form, infraction: e.target.value })}
              >
                <option value="" disabled>
                  Choose infraction
                </option>
                {HOCKEY_INFRACTIONS.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minutes" htmlFor="minutes">
              <Select
                id="minutes"
                required
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: e.target.value })}
              >
                <option value="" disabled>
                  Choose length
                </option>
                {HOCKEY_PENALTY_MINUTES.map((m) => (
                  <option key={m} value={String(m)}>
                    {HOCKEY_PENALTY_MINUTE_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Ejection"
              htmlFor="ejection"
              hint="A game misconduct or match penalty can suspend the player when the game is finalized."
            >
              <Select
                id="ejection"
                value={form.ejection}
                onChange={(e) => setForm({ ...form, ejection: e.target.value })}
              >
                <option value="">None</option>
                {EJECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EJECTION_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

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
          <Alert tone="error">
            {error}
          </Alert>
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
