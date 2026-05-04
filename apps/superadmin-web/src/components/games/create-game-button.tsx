"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { gameOps } from "@/lib/api/browser-api";
import type { League, Team } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateGameButton({
  leagues,
  teams
}: {
  leagues: League[];
  teams: Team[];
}) {
  const [open, setOpen] = useState(false);
  const disabled = leagues.length === 0 || teams.length < 2;
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" />
        New game
      </Button>
      <CreateGameDialog
        open={open}
        onClose={() => setOpen(false)}
        leagues={leagues}
        teams={teams}
      />
    </>
  );
}

function CreateGameDialog({
  open,
  onClose,
  leagues,
  teams
}: {
  open: boolean;
  onClose: () => void;
  leagues: League[];
  teams: Team[];
}) {
  const router = useRouter();
  const initialLeague = leagues[0];

  const teamsForSport = useMemo(() => {
    if (!initialLeague) return teams;
    return teams.filter((t) => t.sportCode === initialLeague.sportCode);
  }, [initialLeague, teams]);

  const [form, setForm] = useState({
    leagueId: initialLeague?.id ?? "",
    sportCode: initialLeague?.sportCode ?? "HOCKEY_ICE",
    homeTeamId: teamsForSport[0]?.id ?? "",
    awayTeamId: teamsForSport[1]?.id ?? teamsForSport[0]?.id ?? "",
    scheduledStartTsUtc: "",
    tz: "America/New_York",
    durationMin: 60,
    venueName: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onLeagueChange(leagueId: string) {
    const l = leagues.find((x) => x.id === leagueId);
    if (!l) return;
    const eligible = teams.filter((t) => t.sportCode === l.sportCode);
    setForm((f) => ({
      ...f,
      leagueId,
      sportCode: l.sportCode,
      homeTeamId: eligible[0]?.id ?? "",
      awayTeamId: eligible[1]?.id ?? eligible[0]?.id ?? ""
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.homeTeamId === form.awayTeamId) {
      setError("Home and away teams must differ.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await gameOps.createGame({
        leagueId: form.leagueId,
        homeTeamId: form.homeTeamId,
        awayTeamId: form.awayTeamId,
        sportCode: form.sportCode,
        scheduledStartTsUtc: new Date(form.scheduledStartTsUtc).toISOString(),
        tz: form.tz,
        durationMin: Number(form.durationMin),
        venueName: form.venueName || null
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const eligibleTeams = teams.filter((t) => t.sportCode === form.sportCode);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule game"
      description="Create a fixture between two teams in the same league. Status starts as scheduled."
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="League" htmlFor="leagueId">
          <Select
            id="leagueId"
            required
            value={form.leagueId}
            onChange={(e) => onLeagueChange(e.target.value)}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.sportCode}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Away team" htmlFor="awayTeamId">
            <Select
              id="awayTeamId"
              required
              value={form.awayTeamId}
              onChange={(e) => set("awayTeamId", e.target.value)}
            >
              {eligibleTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Home team" htmlFor="homeTeamId">
            <Select
              id="homeTeamId"
              required
              value={form.homeTeamId}
              onChange={(e) => set("homeTeamId", e.target.value)}
            >
              {eligibleTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kickoff (local)" htmlFor="scheduledStartTsUtc">
            <Input
              id="scheduledStartTsUtc"
              type="datetime-local"
              required
              value={form.scheduledStartTsUtc}
              onChange={(e) => set("scheduledStartTsUtc", e.target.value)}
            />
          </Field>
          <Field label="Timezone" htmlFor="tz">
            <Input
              id="tz"
              value={form.tz}
              onChange={(e) => set("tz", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Duration (min)" htmlFor="durationMin">
            <Input
              id="durationMin"
              type="number"
              min={15}
              max={360}
              value={form.durationMin}
              onChange={(e) => set("durationMin", Number(e.target.value))}
            />
          </Field>
          <Field label="Venue" htmlFor="venueName">
            <Input
              id="venueName"
              value={form.venueName}
              onChange={(e) => set("venueName", e.target.value)}
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scheduling…
              </>
            ) : (
              "Schedule game"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
