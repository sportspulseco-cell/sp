"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, ShieldAlert, UserPlus, X } from "lucide-react";
import { Alert, Badge, Button, Eyebrow, Select } from "@sportspulse/ui";
import type {
  AdminGameSubs,
  CaptainGameSubs,
  SubCandidate,
  SubRequest,
  TeamSubs
} from "@sportspulse/api-client";

/**
 * Substitute requests (UC-31, FR-3.3.1, FR-3.3.3), shared by the captain
 * console (CaptainSubsPanel) and the admin game page (GameSubsAdminPanel).
 * The server decides who is eligible and every state; these panels show
 * what it returned and read the view back after each action, so the page
 * changes without a reload. Transport-agnostic: each app passes its
 * `subs` SDK binding.
 */

function errText(e: unknown): string {
  return (e as Error)?.message || "Something went wrong. Try again.";
}

function CandidateLine({ c }: { c: SubCandidate }) {
  return (
    <div className="min-w-0">
      <p className="text-[14px] font-medium text-fg">{c.name}</p>
      <p className="mt-0.5 text-[12px] text-fg-muted">
        {c.levelLabel ?? "Level not set"}
        {" · "}
        {c.positionLabels.length ? c.positionLabels.join(", ") : "Any position"}
        {" · "}
        {c.source === "free_agent" ? "Free agent" : `Plays for ${c.sourceTeamName ?? "another team"}`}
      </p>
    </div>
  );
}

function RequestRows({
  requests,
  onCancel,
  busy
}: {
  requests: SubRequest[];
  onCancel?: (r: SubRequest) => void;
  busy: string | null;
}) {
  if (requests.length === 0) {
    return <p className="text-[13px] text-fg-muted">No sub requests yet.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-fg">{r.personName}</p>
            <p className="mt-0.5 text-[12px] text-fg-muted">
              {r.rosterOverride ? "Assigned by a league admin" : "Asked by the captain"}
              {r.cancelReasonText ? ` · ${r.cancelReasonText}` : ""}
              {r.note ? ` · ${r.note}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge status={r.status}>{r.statusLabel}</Badge>
            {onCancel && r.status === "requested" ? (
              <Button size="sm" variant="ghost" onClick={() => onCancel(r)} disabled={busy !== null}>
                {busy === `cancel:${r.id}` ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
                )}
                Cancel
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// =====================================================================
// Captain
// =====================================================================

export interface CaptainSubsApi {
  captainView: (teamId: string, gameId: string) => Promise<CaptainGameSubs>;
  request: (
    teamId: string,
    gameId: string,
    body: { personId: string; note?: string }
  ) => Promise<{ request: SubRequest; created: boolean }>;
  cancel: (teamId: string, requestId: string) => Promise<{ request: SubRequest; changed: boolean }>;
}

export function CaptainSubsPanel({
  api,
  teamId,
  gameId,
  initial
}: {
  api: CaptainSubsApi;
  teamId: string;
  gameId: string;
  initial: CaptainGameSubs;
}) {
  const [view, setView] = useState<CaptainGameSubs>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showIneligible, setShowIneligible] = useState(false);

  const reload = useCallback(async () => {
    setView(await api.captainView(teamId, gameId));
  }, [api, teamId, gameId]);

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      setDone(await fn());
    } catch (e) {
      setError(errText(e));
    } finally {
      // The server's view after the action, whatever happened.
      await reload().catch(() => undefined);
      setBusy(null);
    }
  }

  const eligible = view.candidates.filter((c) => c.eligible);
  const ineligible = view.candidates.filter((c) => !c.eligible);
  const spotsLeft = Math.max(0, view.rules.maxGuestPlayersPerGame - view.guestsThisGame);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <Eyebrow>Guest spots</Eyebrow>
        <p className="mt-1 text-[15px] font-semibold text-fg">
          {view.guestsThisGame} of {view.rules.maxGuestPlayersPerGame} used
          {spotsLeft > 0 ? ` · ${spotsLeft} open` : ""}
        </p>
        {view.guests.length > 0 ? (
          <p className="mt-1 text-[13px] text-fg-muted">
            On the lineup: {view.guests.map((g) => g.name).join(", ")}
          </p>
        ) : null}
        {view.closedReason ? (
          <div className="mt-3">
            <Alert tone="warning">{view.closedReason} No new request can be sent.</Alert>
          </div>
        ) : null}
      </section>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      <section className="space-y-3">
        <Eyebrow>Requests</Eyebrow>
        <RequestRows
          requests={view.requests}
          busy={busy}
          onCancel={(r) =>
            act(`cancel:${r.id}`, async () => {
              const res = await api.cancel(teamId, r.id);
              return res.changed ? `Request to ${r.personName} cancelled.` : `${r.personName}: ${res.request.statusLabel}.`;
            })
          }
        />
      </section>

      <section className="space-y-3">
        <Eyebrow>Players who can sub</Eyebrow>
        <p className="text-[13px] text-fg-muted">
          Free agents in this season and players at this level on other teams, who are free at game time and not suspended.
        </p>
        <label className="block text-[12px] font-medium text-fg">
          Note to the player (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="e.g. We need a defenseman"
            className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </label>
        {eligible.length === 0 ? (
          <p className="rounded-md border border-border px-4 py-6 text-center text-[13px] text-fg-muted">
            No eligible player right now. Ask your league admin, who can assign a sub.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {eligible.map((c) => {
              const asked = c.openRequest && c.openRequest.teamId === teamId;
              const askedElsewhere = c.openRequest && c.openRequest.teamId !== teamId;
              return (
                <li key={c.personId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <CandidateLine c={c} />
                  {asked ? (
                    <Badge mono tone="info">Asked</Badge>
                  ) : askedElsewhere ? (
                    <Badge mono tone="neutral">Asked by the other team</Badge>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy !== null || !!view.closedReason}
                      onClick={() =>
                        act(`ask:${c.personId}`, async () => {
                          const res = await api.request(teamId, gameId, {
                            personId: c.personId,
                            note: note.trim() || undefined
                          });
                          return res.created
                            ? `Request sent to ${c.name}. They are told in the app and by email.`
                            : `${c.name} already has your request.`;
                        })
                      }
                    >
                      {busy === `ask:${c.personId}` ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                      )}
                      Ask to sub
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {ineligible.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowIneligible((s) => !s)}
              className="text-[12px] text-fg-muted underline"
            >
              {showIneligible ? "Hide" : "Show"} players who cannot sub ({ineligible.length})
            </button>
            {showIneligible ? (
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {ineligible.map((c) => (
                  <li key={c.personId} className="px-4 py-3">
                    <CandidateLine c={c} />
                    <p className="mt-1 text-[12px] text-[var(--tint-rose-fg)]">{c.reasonText}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// =====================================================================
// League admin
// =====================================================================

export interface AdminSubsApi {
  adminView: (gameId: string) => Promise<AdminGameSubs>;
  assign: (
    gameId: string,
    body: { teamId: string; personId: string; note?: string }
  ) => Promise<{ request: SubRequest; created: boolean }>;
}

function AdminTeamSubs({
  team,
  closed,
  onAssign,
  busy
}: {
  team: TeamSubs;
  closed: string | null;
  onAssign: (team: TeamSubs, personId: string, note: string) => void;
  busy: string | null;
}) {
  const choices = team.candidates.filter((c) => c.adminOverridable);
  const [personId, setPersonId] = useState("");
  const [note, setNote] = useState("");
  const picked = choices.find((c) => c.personId === personId) ?? null;
  const full = team.guestsThisGame >= team.rules.maxGuestPlayersPerGame;
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-fg">{team.teamName}</p>
        <p className="text-[12px] text-fg-muted">
          Guests {team.guestsThisGame} of {team.rules.maxGuestPlayersPerGame}
        </p>
      </div>
      {team.guests.length > 0 ? (
        <ul className="space-y-1">
          {team.guests.map((g) => (
            <li key={g.attendanceId} className="flex items-center gap-2 text-[13px] text-fg">
              {g.name}
              {g.rosterOverride ? (
                <Badge mono tone="warning">
                  <ShieldAlert className="mr-1 inline h-3 w-3" />
                  Admin override
                </Badge>
              ) : g.viaRequestId ? (
                <Badge mono tone="success">Sub request</Badge>
              ) : (
                <Badge mono tone="neutral">Added by captain</Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-muted">No guests on this game.</p>
      )}
      <RequestRows requests={team.requests} busy={busy} />
      {closed ? null : full ? (
        <p className="text-[12px] text-fg-muted">Every guest spot is filled.</p>
      ) : choices.length === 0 ? (
        <p className="text-[12px] text-fg-muted">No free agent or same-level player can be assigned.</p>
      ) : (
        <div className="space-y-2">
          <label className="block text-[12px] font-medium text-fg">
            Assign a sub
            <Select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="mt-1 w-full"
            >
              <option value="">Pick a player</option>
              {choices.map((c) => (
                <option key={c.personId} value={c.personId}>
                  {c.name} · {c.levelLabel ?? "Level not set"}
                  {c.eligible ? "" : ` · override: ${c.reasonText}`}
                </option>
              ))}
            </Select>
          </label>
          {picked && !picked.eligible ? (
            <Alert tone="warning">This assigns {picked.name} with an override: {picked.reasonText}. The override is recorded.</Alert>
          ) : null}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Note (optional)"
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg"
          />
          <Button
            size="sm"
            disabled={!picked || busy !== null}
            onClick={() => {
              if (picked) onAssign(team, picked.personId, note.trim());
            }}
          >
            {busy === `assign:${team.teamId}` ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
            )}
            Assign sub
          </Button>
        </div>
      )}
    </div>
  );
}

export function GameSubsAdminPanel({ api, gameId }: { api: AdminSubsApi; gameId: string }) {
  const [view, setView] = useState<AdminGameSubs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setView(await api.adminView(gameId));
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, [api, gameId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function assign(team: TeamSubs, personId: string, note: string) {
    setBusy(`assign:${team.teamId}`);
    setError(null);
    setDone(null);
    try {
      const res = await api.assign(gameId, { teamId: team.teamId, personId, note: note || undefined });
      setDone(
        res.created
          ? `${res.request.personName} added to ${team.teamName} as a sub. The player and the captain are told.`
          : `${res.request.personName} is already on this game for ${team.teamName}.`
      );
    } catch (e) {
      setError(errText(e));
    } finally {
      await reload();
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="border-b border-border px-6 py-4">
        <Eyebrow>Subs</Eyebrow>
        <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">Guests and sub requests</p>
      </header>
      <div className="space-y-4 px-6 py-5">
        {loadError ? <Alert tone="error">Could not load subs: {loadError}</Alert> : null}
        {!view && !loadError ? <p className="text-[13px] text-fg-muted">Loading subs…</p> : null}
        {view?.assignClosedReason ? <Alert tone="info">{view.assignClosedReason} Subs can no longer be assigned.</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}
        {view ? (
          <div className="grid gap-4 md:grid-cols-2">
            {view.teams.map((t) => (
              <AdminTeamSubs key={t.teamId} team={t} closed={view.assignClosedReason} onAssign={assign} busy={busy} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
