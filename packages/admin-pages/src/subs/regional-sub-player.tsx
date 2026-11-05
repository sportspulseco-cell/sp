"use client";
/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Select, Skeleton } from "@sportspulse/ui";
import { FREE_AGENT_POSITIONS, formatInZone, type RegionalSubBroadcast, type RegionalSubInbox } from "@sportspulse/kernel";
export interface RegionalPlayerApi {
  regionalMine: (cursor?: string) => Promise<RegionalSubInbox>;
  subscribeRegional: (regionId: string, body: { enabled: boolean; positions: string[] }) => Promise<unknown>;
  answerRegional: (id: string, action: "accept" | "decline") => Promise<{ response: string; broadcast: RegionalSubBroadcast }>;
}
export function RegionalSubPlayerPanel({ api, initial, confirmedOnly = false }: { api: RegionalPlayerApi; initial: RegionalSubInbox | null; confirmedOnly?: boolean }) {
  const [view, setView] = useState(initial), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null), [regionId, setRegionId] = useState("");
  const [enabled, setEnabled] = useState(false), [positions, setPositions] = useState<string[]>([]);
  const load = useCallback(async (cursor?: string) => {
    const result = await api.regionalMine(cursor);
    setView(current => cursor && current ? { ...result, invitations: [...current.invitations, ...result.invitations] } : result);
  }, [api]);
  useEffect(() => {
    if (!initial) void load().catch(error => setError(error instanceof Error ? error.message : "Could not load substitute invitations."));
  }, [initial, load]);
  useEffect(() => {
    if (!view || regionId) return;
    const region = view.regions.find(region => region.enabled) ?? view.regions[0];
    if (region) { setRegionId(region.id); setEnabled(region.enabled); setPositions(region.positions); }
  }, [view, regionId]);
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setError(""); setMessage("");
    try { await action(); await load(); setMessage(success); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save that change. Try again."); }
    finally { setBusy(null); }
  }
  if (view && !view.regions.length && !view.invitations.length) return null;
  return <section aria-labelledby="regional-player-title" className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
    <div><h2 id="regional-player-title" className="text-base font-semibold">{confirmedOnly ? "Confirmed substitute games" : "Play as a substitute"}</h2>
      <p className="mt-1 text-sm text-fg-muted">{confirmedOnly ? "Upcoming games you agreed to play for another team." : "Choose where you want invitations. Your contact details stay private."}</p></div>
    {error ? <Alert tone="error">{error} {!view ? <button className="ml-2 underline" onClick={() => void load().then(() => setError("")).catch(error => setError(String(error)))}>Try again</button> : null}</Alert> : null}
    {message ? <Alert tone="success">{message}</Alert> : null}
    {!view && !error ? <div role="status" aria-label="Loading substitute invitations"><Skeleton className="h-24" /></div> : null}
    {view?.invitations.map(({ broadcast, response }) => <article key={broadcast.id} className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{response === "accepted" ? `Playing for ${broadcast.teamName}` : `${broadcast.teamName} needs a ${broadcast.position === "goalie" ? "goalie" : "substitute"}`}</h3>
        <Badge>{response === "accepted" ? "You're confirmed" : response === "declined" ? "Declined" : response === "closed" ? "Invitation closed" : "Staff approved"}</Badge></div>
      <p className="text-sm text-fg-muted">{formatInZone(broadcast.startsAt, broadcast.timezone)}{broadcast.venueName ? ` · ${broadcast.venueName}` : ""} · {broadcast.regionName}</p>
      {broadcast.note ? <p className="text-sm">{broadcast.note}</p> : null}
      {response === "invited" && broadcast.status === "approved" ? <>
        <p className="text-sm text-fg-muted">Accepting shares your name with this team and puts you on its guest lineup. Your eligibility is checked again before the place is confirmed.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={busy !== null} onClick={() => void run(broadcast.id, () => api.answerRegional(broadcast.id, "accept"), "You're confirmed on the guest lineup.")}>{busy === broadcast.id ? "Checking…" : "I can play"}</Button>
          <Button variant="ghost" disabled={busy !== null} onClick={() => void run(broadcast.id, () => api.answerRegional(broadcast.id, "decline"), "Invitation declined.")}>Not this time</Button></div>
      </> : null}
    </article>)}
    {view?.nextCursor ? <Button variant="outline" disabled={busy !== null} onClick={() => {
      setBusy("more"); void load(view.nextCursor!).catch(error => setError(String(error))).finally(() => setBusy(null));
    }}>{confirmedOnly ? "More substitute games" : "More invitations"}</Button> : null}
    {view?.regions.length ? <details className="rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Regional invitation preferences</summary>
      <form className="mt-4 space-y-4" onSubmit={event => {
        event.preventDefault(); void run("preferences", () => api.subscribeRegional(regionId, { enabled, positions }), "Your regional preferences are saved.");
      }}><fieldset disabled={busy !== null} className="space-y-4">
        <Field label="Region" htmlFor="sub-region"><Select id="sub-region" value={regionId} onChange={event => {
          const region = view.regions.find(region => region.id === event.target.value); if (!region) return;
          setRegionId(region.id); setEnabled(region.enabled); setPositions(region.positions); setMessage("");
        }}>{view.regions.map(region => <option key={region.id} value={region.id}>{region.orgName} · {region.name}</option>)}</Select></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Send me approved substitute invitations across leagues in this region</label>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Positions I play</legend><div className="flex flex-wrap gap-x-5 gap-y-2">
          {FREE_AGENT_POSITIONS.map(position => <label key={position.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={positions.includes(position.value)} onChange={event => setPositions(current => event.target.checked ? [...current, position.value] : current.filter(value => value !== position.value))} />{position.label}</label>)}
        </div></fieldset>
        <p className="text-sm text-fg-muted">You can turn invitations off here at any time. Only requests matching your region, positions and eligibility are sent.</p>
        <Button type="submit" disabled={busy !== null || !regionId || (enabled && !positions.length)}>{busy === "preferences" ? "Saving…" : "Save preferences"}</Button>
      </fieldset></form>
    </details> : null}
  </section>;
}
