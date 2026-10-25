"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, Star, UserPlus, X } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Table, TBody, TD, TH, THead, TR } from "@sportspulse/ui";
import type {
  FreeAgentOffer,
  FreeAgentOfferTeam,
  FreeAgentPoolEntry
} from "@sportspulse/api-client";
import {
  FREE_AGENT_DAYS,
  FREE_AGENT_LEVELS,
  FREE_AGENT_POSITIONS,
  formatFreeAgentAvailability,
  freeAgentLevelLabel,
  freeAgentPositionLabel
} from "@sportspulse/kernel";

/** The SDK calls this panel needs (registrationV2Admin namespace). */
export interface FreeAgentPoolApi {
  listFreeAgentPool: (q?: {
    seasonId?: string;
    position?: string;
    level?: string;
    day?: string;
  }) => Promise<{ items: FreeAgentPoolEntry[]; seasons: Array<{ id: string; name: string }> }>;
  listFreeAgentOfferTeams: (entryId: string) => Promise<FreeAgentOfferTeam[]>;
  offerFreeAgent: (
    entryId: string,
    body: { teamId: string }
  ) => Promise<{ offer: FreeAgentOffer; created: boolean }>;
}

type Filters = { seasonId: string; position: string; level: string; day: string };
const NO_FILTERS: Filters = { seasonId: "", position: "", level: "", day: "" };

/**
 * Admin view of the free-agent pool (CAP-10; UC-03 "Admin manually
 * assigns player to a team"). Lists the free agents of the seasons the
 * admin's role covers (the API scopes it), with season, position, level
 * and day filters. "Assign to team" picks a team that plays the player's
 * season and sends the same offer a captain sends: the player accepts or
 * declines, so nobody lands on a roster without saying yes. The row shows
 * the offer the API stored, without a reload.
 *
 * Transport-agnostic: the app passes its registrationV2Admin binding.
 * Mounted on the super-admin and org-admin Registrations pages.
 */
export function FreeAgentPoolPanel({
  api,
  showHeading = true
}: {
  api: FreeAgentPoolApi;
  /** False when the page already titles the section (e.g. a SectionRail). */
  showHeading?: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [rows, setRows] = useState<FreeAgentPoolEntry[] | null>(null);
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (f: Filters) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await api.listFreeAgentPool({
          seasonId: f.seasonId || undefined,
          position: f.position || undefined,
          level: f.level || undefined,
          day: f.day || undefined
        });
        setRows(res.items);
        // Keep every season seen so a narrow filter never empties the picker.
        setSeasons((prev) => {
          const map = new Map(prev.map((s) => [s.id, s.name]));
          for (const s of res.seasons) map.set(s.id, s.name);
          return [...map.entries()].map(([id, name]) => ({ id, name }));
        });
      } catch (e) {
        setLoadError((e as Error).message);
        setRows(null);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  function setFilter(key: keyof Filters, value: string) {
    setNotice(null);
    setAssigning(null);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function onOffered(entryId: string, offer: FreeAgentOffer, created: boolean, playerName: string) {
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === entryId
              ? {
                  ...r,
                  openOffers: [
                    ...(r.openOffers ?? []).filter((o) => o.id !== offer.id),
                    offer
                  ]
                }
              : r
          )
        : prev
    );
    setAssigning(null);
    setNotice(
      created
        ? `Offer sent to ${playerName}. They join ${offer.teamName} when they accept.`
        : `${offer.teamName} already has an open offer to ${playerName}.`
    );
  }

  const filtered = filters.seasonId || filters.position || filters.level || filters.day;

  return (
    <section aria-label="Free-agent pool" className="space-y-4">
      {showHeading ? (
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Free agents</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Players looking for a team in your seasons. Assign one to a team to send them an
            offer; they join the roster when they accept.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Season"
          value={filters.seasonId}
          onChange={(v) => setFilter("seasonId", v)}
          options={[{ value: "", label: "All seasons" }, ...seasons.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <FilterSelect
          label="Position"
          value={filters.position}
          onChange={(v) => setFilter("position", v)}
          options={[
            { value: "", label: "Any position" },
            ...FREE_AGENT_POSITIONS.map((p) => ({ value: p.value, label: p.label }))
          ]}
        />
        <FilterSelect
          label="Level"
          value={filters.level}
          onChange={(v) => setFilter("level", v)}
          options={[
            { value: "", label: "Any level" },
            ...FREE_AGENT_LEVELS.map((l) => ({ value: l.value, label: l.label }))
          ]}
        />
        <FilterSelect
          label="Available on"
          value={filters.day}
          onChange={(v) => setFilter("day", v)}
          options={[
            { value: "", label: "Any day" },
            ...FREE_AGENT_DAYS.map((d) => ({ value: d, label: d }))
          ]}
        />
        {filtered ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </Button>
        ) : null}
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted" /> : null}
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {loadError ? (
        <Alert tone="error">Could not load the free-agent pool: {loadError}</Alert>
      ) : rows === null ? null : rows.length === 0 ? (
        <EmptyState
          icon={Star}
          title={filtered ? "No free agents match these filters" : "No free agents right now"}
          description={
            filtered
              ? "Clear a filter to see more players."
              : "Players who list themselves as free agents for one of your seasons show up here."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <Table>
            <THead>
              <TR>
                <TH>Player</TH>
                <TH>Season</TH>
                <TH>Positions</TH>
                <TH>Level</TH>
                <TH>Available</TH>
                <TH>Offers</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <PoolRow
                  key={r.id}
                  row={r}
                  api={api}
                  open={assigning === r.id}
                  onOpen={() => {
                    setNotice(null);
                    setAssigning(r.id);
                  }}
                  onClose={() => setAssigning(null)}
                  onOffered={(offer, created) =>
                    onOffered(r.id, offer, created, r.playerName ?? "the player")
                  }
                />
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function PoolRow({
  row,
  api,
  open,
  onOpen,
  onClose,
  onOffered
}: {
  row: FreeAgentPoolEntry;
  api: FreeAgentPoolApi;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onOffered: (offer: FreeAgentOffer, created: boolean) => void;
}) {
  const offers = (row.openOffers ?? []).filter((o) => o.status === "pending");
  return (
    <>
      <TR>
        <TD>
          <div className="font-medium text-fg">{row.playerName ?? "—"}</div>
          {row.playerEmail ? (
            <div className="text-[11px] text-fg-muted">{row.playerEmail}</div>
          ) : null}
        </TD>
        <TD className="text-[12px] text-fg-muted">{row.seasonName ?? "—"}</TD>
        <TD>
          {row.positions.map((p) => (
            <Badge key={p} mono tone="info" className="mr-1">
              {freeAgentPositionLabel(p)}
            </Badge>
          ))}
        </TD>
        <TD>
          <Badge mono tone="neutral">
            {freeAgentLevelLabel(row.levelPrimary)}
          </Badge>
        </TD>
        <TD className="text-[12px] text-fg-muted">{formatFreeAgentAvailability(row.availability)}</TD>
        <TD className="text-[12px] text-fg-muted">
          {offers.length === 0
            ? "None"
            : offers.map((o) => (
                <div key={o.id}>
                  Offer sent: {o.teamName}
                </div>
              ))}
        </TD>
        <TD className="text-right">
          {open ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
              Assign to team
            </Button>
          )}
        </TD>
      </TR>
      {open ? (
        <TR>
          <td colSpan={7} className="px-5 py-3.5">
            <AssignToTeam row={row} api={api} onClose={onClose} onOffered={onOffered} />
          </td>
        </TR>
      ) : null}
    </>
  );
}

function AssignToTeam({
  row,
  api,
  onClose,
  onOffered
}: {
  row: FreeAgentPoolEntry;
  api: FreeAgentPoolApi;
  onClose: () => void;
  onOffered: (offer: FreeAgentOffer, created: boolean) => void;
}) {
  const [teams, setTeams] = useState<FreeAgentOfferTeam[] | null>(null);
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listFreeAgentOfferTeams(row.id)
      .then((t) => {
        if (!alive) return;
        setTeams(t);
        // One team: pick it. Several: the admin chooses (no alphabetical guess).
        if (t.length === 1) setTeamId(t[0]!.teamId);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [api, row.id]);

  async function send() {
    if (!teamId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.offerFreeAgent(row.id, { teamId });
      onOffered(res.offer, res.created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-fg">
          Offer {row.playerName ?? "this player"} a spot for {row.seasonName ?? "their season"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-fg-muted hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {teams === null && !error ? (
        <p className="flex items-center gap-2 text-[12px] text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading teams…
        </p>
      ) : teams && teams.length === 0 ? (
        <p className="text-[12px] text-fg-muted">
          No team plays {row.seasonName ?? "this season"} yet. Place a team in one of its
          divisions first, then assign the player.
        </p>
      ) : teams ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-fg">
            Team
            <select
              aria-label="Team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-9 min-w-[16rem] rounded-md border border-border bg-surface-1 px-3 text-[13px] text-fg"
            >
              <option value="" disabled>
                Pick a team…
              </option>
              {teams.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.teamName} · {t.divisionName}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" onClick={send} disabled={!teamId || busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            Send offer
          </Button>
          <p className="basis-full text-[11px] text-fg-muted">
            The player gets an email and a card in the player app. They join the team only
            when they accept.
          </p>
        </div>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-fg">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-surface-1 px-3 text-[13px] text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
