"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { fetchAll } from "@sportspulse/api-client";
import { Alert, Combobox } from "@sportspulse/ui";
import { gameOps, leagueMgmt } from "@/lib/api/browser-api";
import type { Division, League, Season, Team } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useOrgRinks } from "./use-org-rinks";

/** Context the Games page passes in: its current URL filters. */
export interface NewGameDefaults {
  leagueId?: string;
  seasonId?: string;
  divisionId?: string;
}

export function CreateGameButton({
  leagues,
  defaults
}: {
  leagues: League[];
  defaults?: NewGameDefaults;
}) {
  const [open, setOpen] = useState(false);
  const usable = leagues.filter((l) => l.status !== "archived");
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={usable.length === 0}
        title={usable.length === 0 ? "Create a league first." : undefined}
      >
        <Plus className="mr-2 h-4 w-4" />
        New game
      </Button>
      {open ? (
        <CreateGameDialog
          onClose={() => setOpen(false)}
          leagues={usable}
          defaults={defaults ?? {}}
        />
      ) : null}
    </>
  );
}

const SEASON_PLAYING = new Set(["in_progress", "playoffs"]);

/** The only option, or none: never guess between several (CLAUDE.md, defaults). */
function onlyOne<T extends { id: string }>(items: T[]): string {
  return items.length === 1 ? items[0]!.id : "";
}

/**
 * New game (UC-07 fallback, SCH-5 / SCH-20). League, then one of its
 * seasons, then one of that season's divisions; both teams come from the
 * teams entered in that division (every page, type to search); the rink
 * comes from the organisation's Rinks & ice time; the start is typed in
 * the rink's time zone and converted on the server. The server checks
 * all of it again and refuses a rink or team clash unless the admin
 * schedules it anyway with a reason.
 */
function CreateGameDialog({
  onClose,
  leagues,
  defaults
}: {
  onClose: () => void;
  leagues: League[];
  defaults: NewGameDefaults;
}) {
  const router = useRouter();
  const sortedLeagues = useMemo(
    () => [...leagues].sort((a, b) => a.name.localeCompare(b.name)),
    [leagues]
  );
  const [leagueId, setLeagueId] = useState(
    defaults.leagueId && leagues.some((l) => l.id === defaults.leagueId)
      ? defaults.leagueId
      : onlyOne(leagues)
  );
  const league = leagues.find((l) => l.id === leagueId) ?? null;

  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [seasonId, setSeasonId] = useState("");
  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [divisionId, setDivisionId] = useState("");
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const { rinks, error: rinkError } = useOrgRinks(league?.orgId ?? null);
  const [surfaceId, setSurfaceId] = useState("");
  const rink = rinks?.find((r) => r.surfaceId === surfaceId) ?? null;

  const [startLocal, setStartLocal] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  // A hand-made game is usually meant to be seen right away (SCH-7);
  // untick to keep it as a draft.
  const [publish, setPublish] = useState(true);
  const [clash, setClash] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // League -> its seasons (archived seasons cannot take games).
  useEffect(() => {
    setSeasons(null);
    setSeasonId("");
    if (!leagueId) return;
    let cancelled = false;
    fetchAll((cursor) => leagueMgmt.listSeasons({ leagueId, limit: 100, cursor }))
      .then((res) => {
        if (cancelled) return;
        const list = res.items
          .filter((s) => s.leagueId === leagueId && s.status !== "archived")
          .sort((a, b) => b.startDate.localeCompare(a.startDate));
        setSeasons(list);
        const playing = list.filter((s) => SEASON_PLAYING.has(s.status));
        setSeasonId(
          defaults.seasonId && list.some((s) => s.id === defaults.seasonId)
            ? defaults.seasonId
            : playing.length === 1
              ? playing[0]!.id
              : onlyOne(list)
        );
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setSeasons([]);
        setLoadError(`Could not load seasons: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, defaults.seasonId]);

  // Season -> its divisions.
  useEffect(() => {
    setDivisions(null);
    setDivisionId("");
    if (!seasonId) return;
    let cancelled = false;
    fetchAll((cursor) => leagueMgmt.listDivisions({ seasonId, limit: 100, cursor }))
      .then((res) => {
        if (cancelled) return;
        const list = res.items
          .filter((d) => d.seasonId === seasonId && d.status !== "archived")
          .sort((a, b) => a.name.localeCompare(b.name));
        setDivisions(list);
        setDivisionId(
          defaults.divisionId && list.some((d) => d.id === defaults.divisionId)
            ? defaults.divisionId
            : onlyOne(list)
        );
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setDivisions([]);
        setLoadError(`Could not load divisions: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [seasonId, defaults.divisionId]);

  // Division -> every team entered in it (all pages, SCH-20).
  useEffect(() => {
    setTeams(null);
    setHomeTeamId("");
    setAwayTeamId("");
    if (!divisionId) return;
    let cancelled = false;
    fetchAll((cursor) => leagueMgmt.listTeams({ divisionId, limit: 100, cursor }))
      .then((res) => {
        if (cancelled) return;
        setTeams([...res.items].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setTeams([]);
        setLoadError(`Could not load the division's teams: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [divisionId]);

  // One rink: take it. Several: the admin picks.
  useEffect(() => {
    if (rinks && rinks.length === 1) setSurfaceId(rinks[0]!.surfaceId);
    else setSurfaceId("");
  }, [rinks]);

  const teamOptions = (exclude: string) =>
    (teams ?? []).filter((t) => t.id !== exclude).map((t) => ({ value: t.id, label: t.name }));
  const division = divisions?.find((d) => d.id === divisionId) ?? null;

  const ready =
    !!leagueId && !!seasonId && !!divisionId && !!homeTeamId && !!awayTeamId && !!surfaceId && !!startLocal;

  async function submit(force: boolean) {
    if (homeTeamId === awayTeamId) {
      setError("Pick two different teams.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await gameOps.createGame({
        leagueId,
        seasonId,
        divisionId,
        homeTeamId,
        awayTeamId,
        surfaceId,
        startLocal,
        durationMin: Number(durationMin),
        publish,
        ...(force ? { force: true, reason: reason.trim() } : {})
      });
      onClose();
      router.refresh();
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 409) setClash(e.message);
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  // Any change to where or when clears an old clash.
  useEffect(() => {
    setClash(null);
  }, [homeTeamId, awayTeamId, surfaceId, startLocal, durationMin]);

  const teamsHint =
    teams === null
      ? divisionId
        ? "Loading the division's teams…"
        : "Pick a division first."
      : `${teams.length} team${teams.length === 1 ? "" : "s"} entered in ${division?.name ?? "this division"}.`;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Schedule game"
      description="Pick the division, both teams, the rink and the start time."
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="League" htmlFor="leagueId">
            <Select
              id="leagueId"
              required
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
            >
              <option value="">Pick a league</option>
              {sortedLeagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Season"
            htmlFor="seasonId"
            hint={
              leagueId && seasons === null
                ? "Loading seasons…"
                : seasons && seasons.length === 0
                  ? "This league has no open season."
                  : undefined
            }
          >
            <Select
              id="seasonId"
              required
              value={seasonId}
              disabled={!seasons || seasons.length === 0}
              onChange={(e) => setSeasonId(e.target.value)}
            >
              <option value="">Pick a season</option>
              {(seasons ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Division"
            htmlFor="divisionId"
            hint={
              seasonId && divisions === null
                ? "Loading divisions…"
                : divisions && divisions.length === 0
                  ? "This season has no divisions."
                  : undefined
            }
          >
            <Select
              id="divisionId"
              required
              value={divisionId}
              disabled={!divisions || divisions.length === 0}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">Pick a division</option>
              {(divisions ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {teams && teams.length < 2 ? (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg">
            {teams.length === 0
              ? `No teams are entered in ${division?.name ?? "this division"} yet.`
              : `Only one team is entered in ${division?.name ?? "this division"}.`}{" "}
            <Link href={`/divisions/${divisionId}`} className="font-medium underline">
              Add teams on the division page
            </Link>
            .
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Away team" htmlFor="awayTeamId" hint={teamsHint}>
            <Combobox
              id="awayTeamId"
              options={teamOptions(homeTeamId)}
              value={awayTeamId}
              onChange={setAwayTeamId}
              placeholder="Type a team name"
              emptyText="No team in this division matches"
              disabled={!teams || teams.length < 2}
            />
          </Field>
          <Field label="Home team" htmlFor="homeTeamId">
            <Combobox
              id="homeTeamId"
              options={teamOptions(awayTeamId)}
              value={homeTeamId}
              onChange={setHomeTeamId}
              placeholder="Type a team name"
              emptyText="No team in this division matches"
              disabled={!teams || teams.length < 2}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Rink"
            htmlFor="surfaceId"
            hint={
              rinkError ??
              (!league
                ? "Pick a league first."
                : rinks === null
                  ? "Loading rinks…"
                  : rinks.length === 0
                    ? "No rinks set up for this organisation yet."
                    : undefined)
            }
          >
            <Select
              id="surfaceId"
              required
              value={surfaceId}
              disabled={!rinks || rinks.length === 0}
              onChange={(e) => setSurfaceId(e.target.value)}
            >
              <option value="">Pick a rink</option>
              {(rinks ?? []).map((r) => (
                <option key={r.surfaceId} value={r.surfaceId}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Date and time"
            htmlFor="startLocal"
            hint={rink ? `Rink time (${rink.timezone}).` : "In the rink's time zone. Pick the rink first."}
          >
            <Input
              id="startLocal"
              type="datetime-local"
              required
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </Field>
        </div>
        {rinks && rinks.length === 0 && league ? (
          <p className="text-[12px] text-fg-muted">
            <Link href="/venues" className="font-medium underline">
              Add a rink under Rinks &amp; ice time
            </Link>
            , then come back.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Duration (min)" htmlFor="durationMin">
            <Input
              id="durationMin"
              type="number"
              min={15}
              max={360}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
          </Field>
        </div>

        <label className="flex items-start gap-2 text-sm text-fg">
          <input
            id="publish"
            type="checkbox"
            className="mt-0.5"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
          />
          <span>
            Show on team schedules now
            <span className="block text-xs text-fg-muted">
              Both teams get a notice. Untick to save a draft only admins and officials see.
            </span>
          </span>
        </label>

        {loadError ? (
          <Alert tone="error">
            {loadError}
          </Alert>
        ) : null}

        {clash ? (
          <Alert tone="warning" className="space-y-2">
            <p>{clash}</p>
            <Field label="Reason" htmlFor="clashReason" hint="Required to schedule over the clash. Kept on the game.">
              <Input
                id="clashReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Back-to-back booking agreed with the rink"
                maxLength={500}
              />
            </Field>
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="error">
            {error}
          </Alert>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {clash ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void submit(true)}
              disabled={loading || !reason.trim()}
              title={reason.trim() ? undefined : "Add a reason to schedule over the clash"}
            >
              Schedule anyway
            </Button>
          ) : null}
          <Button type="submit" disabled={loading || !ready}>
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
