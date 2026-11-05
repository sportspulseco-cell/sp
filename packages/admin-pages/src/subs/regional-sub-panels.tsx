"use client";
/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Field, Input, Select, Skeleton } from "@sportspulse/ui";
import { formatInZone, type RegionalSubBroadcast, type RegionalSubGameView, type RegionalSubRequestInput } from "@sportspulse/kernel";

const LABELS: Record<string, string> = { pending_review: "Waiting for staff review", approved: "Invitations open",
  rejected: "Needs an update", cancelled: "Cancelled", filled: "Substitute confirmed" };
const POSITION = { goalie: "Goalie", skater: "Skater", any: "Any position" };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Could not complete that action. Try again.";
export interface RegionalCaptainApi {
  regionalView: (teamId: string, gameId: string) => Promise<RegionalSubGameView>;
  requestRegional: (teamId: string, gameId: string, body: RegionalSubRequestInput) => Promise<RegionalSubBroadcast>;
  cancelRegional: (teamId: string, id: string) => Promise<RegionalSubBroadcast>;
}
export function RegionalSubCaptainPanel({ api, teamId, gameId, onChanged }: {
  api: RegionalCaptainApi; teamId: string; gameId: string; onChanged?: () => Promise<unknown>;
}) {
  const [view, setView] = useState<RegionalSubGameView | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const [position, setPosition] = useState<RegionalSubRequestInput["position"]>("goalie"), [needed, setNeeded] = useState("1"), [note, setNote] = useState("");
  const requestKey = useRef(crypto.randomUUID());
  const requestVersion = useRef(0), lastFilled = useRef<number | null>(null);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const next = await api.regionalView(teamId, gameId);
      if (version !== requestVersion.current) return;
      setView(next); setError("");
      const filled = next.items.reduce((sum, item) => sum + item.filled, 0);
      if (lastFilled.current !== null && filled !== lastFilled.current) await onChanged?.();
      lastFilled.current = filled;
    } catch (error) { if (version === requestVersion.current) setError(errorText(error)); }
  }, [api, teamId, gameId, onChanged]);
  useEffect(() => { void load(); }, [load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await load(); setEditing(false); requestKey.current = crypto.randomUUID(); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  const active = view?.items.find(item => item.status === "pending_review" || item.status === "approved");
  const latest = active ?? view?.items[0];
  useEffect(() => {
    if (!active || view?.problem || busy) return;
    let checking = false;
    const refresh = () => { if (document.visibilityState !== "visible" || checking) return; checking = true; void load().finally(() => { checking = false; }); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [active?.id, view?.problem, busy, load]);
  return <section aria-labelledby="regional-request-title" className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
    <div><h2 id="regional-request-title" className="text-base font-semibold">Need a substitute?</h2>
      <p className="mt-1 text-sm text-fg-muted">Ask staff to contact eligible players across leagues in {view?.regionName ?? "your region"}. Their contact details stay private.</p></div>
    {!view && !error ? <div role="status" aria-label="Loading regional substitute requests"><Skeleton className="h-20" /></div> : null}
    {error ? <Alert tone="error">{error} {!view ? <button className="ml-2 underline" onClick={() => void load()}>Try again</button> : null}</Alert> : null}
    {latest ? <div className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{latest.needed} {POSITION[latest.position].toLowerCase()}{latest.needed > 1 ? "s" : ""}</span><Badge>{LABELS[latest.status] ?? latest.status}</Badge></div>
      {latest.status === "approved" ? <p className="text-sm text-fg-muted">{latest.invitedCount} private invitations · {latest.filled} confirmed</p> : null}
      {latest.accepted?.length ? <p className="text-sm">On your guest lineup: {latest.accepted.map(person => person.name).join(", ")}</p> : null}
      {latest.reviewNote ? <p className="text-sm text-fg-muted">Staff: {latest.reviewNote}</p> : null}
      {latest.closedReason ? <p className="text-sm text-fg-muted">{latest.closedReason}</p> : null}
      {active ? <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setBusy(true); void load().finally(() => setBusy(false)); }}>Refresh status</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => api.cancelRegional(teamId, active.id))}>{active.filled ? "Cancel remaining invitations" : "Cancel this request"}</Button></div> : null}
    </div> : null}
    {view?.problem ? <p className="text-sm text-fg-muted">{view.problem}</p> : null}
    {view && !view.problem && !active ? editing ? <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); void run(() => api.requestRegional(teamId, gameId, { requestKey: requestKey.current,
        position, needed: Number(needed), note: note.trim() }));
    }}>
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Position needed" htmlFor="regional-position"><Select id="regional-position" value={position} onChange={event => setPosition(event.target.value as typeof position)}>
          {Object.entries(POSITION).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="Number needed" htmlFor="regional-needed"><Input id="regional-needed" type="number" min={1} max={10} required value={needed} onChange={event => setNeeded(event.target.value)} /></Field></div>
        <Field label="Note for the invitation" htmlFor="regional-note" hint="Optional. Include only details the invited players need."><Input id="regional-note" maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></Field>
        <p className="text-sm text-fg-muted">Staff review this request before any player receives an invitation.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit">{busy ? "Submitting…" : "Submit for staff review"}</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Back</Button></div>
      </fieldset>
    </form> : <Button disabled={busy} onClick={() => setEditing(true)}>Ask staff to find a sub</Button> : null}
  </section>;
}

export interface RegionalStaffApi {
  regionalPending: (cursor?: string) => Promise<{ items: RegionalSubBroadcast[]; nextCursor: string | null }>;
  reviewRegional: (id: string, body: { action: "approve" | "reject"; note?: string }) => Promise<RegionalSubBroadcast>;
}
export function RegionalSubStaffQueue({ api }: { api: RegionalStaffApi }) {
  const [items, setItems] = useState<RegionalSubBroadcast[] | null>(null), [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState<string | null>(null), [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async (after?: string) => {
    setError("");
    try { const result = await api.regionalPending(after); setItems(current => after ? [...(current ?? []), ...result.items] : result.items); setCursor(result.nextCursor); }
    catch (error) { setError(errorText(error)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (!busy && document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh);
  }, [load, busy]);
  async function review(id: string, action: "approve" | "reject") {
    if (action === "reject" && !notes[id]?.trim()) { setError("Add a short message so the captain knows what to change."); return; }
    setBusy(id); setError("");
    try { await api.reviewRegional(id, { action, note: notes[id]?.trim() }); setItems(current => current?.filter(item => item.id !== id) ?? null); await load(); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(null); }
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-fg-muted">Upcoming games first</p><Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setBusy("refresh"); void load().finally(() => setBusy(null)); }}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</Button></div>
    {error ? <Alert tone="error">{error} <button className="ml-2 underline" onClick={() => void load()}>Reload requests</button></Alert> : null}
    {!items && !error ? <div role="status" aria-label="Loading substitute approval queue"><Skeleton className="h-40" /></div> : null}
    {items?.length === 0 ? <div className="rounded-xl border border-border p-6"><h2 className="font-semibold">No requests waiting for review</h2><p className="mt-1 text-sm text-fg-muted">Captain requests will appear here before regional invitations are sent.</p></div> : null}
    {items?.map(item => <section key={item.id} className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{item.teamName}</h2>
        <p className="mt-1 text-sm text-fg-muted">{formatInZone(item.startsAt, item.timezone)}{item.venueName ? ` · ${item.venueName}` : ""}</p></div><Badge>Waiting for review</Badge></div>
      <p className="text-sm">Needs {item.needed} {POSITION[item.position].toLowerCase()}{item.needed > 1 ? "s" : ""} · {item.regionName}</p>
      {item.note ? <p className="rounded-md bg-bg-subtle p-3 text-sm">{item.note}</p> : null}
      <Field label="Message for the captain" htmlFor={`review-${item.id}`} hint="Optional when approving. Explain what needs changing when declining."><Input id={`review-${item.id}`} maxLength={500} disabled={busy !== null} value={notes[item.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} /></Field>
      <p className="text-sm text-fg-muted">Approval sends private invitations to opted-in players who match the region, position and eligibility rules. Accepting a place adds the player to this game's guest lineup.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy !== null} onClick={() => void review(item.id, "approve")}>{busy === item.id ? "Saving…" : "Approve and send invitations"}</Button><Button variant="ghost" disabled={busy !== null} onClick={() => void review(item.id, "reject")}>Return to captain</Button></div>
    </section>)}
    {cursor ? <Button variant="outline" disabled={busy !== null} onClick={() => { setBusy("page"); void load(cursor).finally(() => setBusy(null)); }}>Load more requests</Button> : null}
  </div>;
}
