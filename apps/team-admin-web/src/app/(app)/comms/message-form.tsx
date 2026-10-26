"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Alert, Button, Input } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

const AUDIENCES = [
  { value: "players", label: "Players on the roster" },
  { value: "captains", label: "Captains" },
  { value: "coaches", label: "Coaches" }
] as const;
const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "in_app", label: "In the app" }
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];
type Channel = (typeof CHANNELS)[number]["value"];

/**
 * Captain writes to the team (UC-20, MON-12). The server picks the
 * recipients from the team; this form only says who and how. One key per
 * composed message, so a double click or retry sends once.
 */
export function TeamMessageForm({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [audiences, setAudiences] = useState<Audience[]>(["players"]);
  const [channels, setChannels] = useState<Channel[]>(["email", "in_app"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const toggle = <T extends string>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const valid = subject.trim() && body.trim() && audiences.length > 0 && channels.length > 0;

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await captain.messageTeam(teamId, {
        audiences,
        channels,
        subject: subject.trim(),
        body: body.trim(),
        idempotencyKey: key
      });
      const skipped = r.noEmail ? ` ${r.noEmail} had no email on file, so they get it in the app only.` : "";
      setResult(
        r.recipients === 0
          ? "Nobody matched those groups on your team, so nothing was sent."
          : `Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"} (${r.queued} notices).${skipped}`
      );
      if (r.recipients > 0) {
        setSubject("");
        setBody("");
        setKey(crypto.randomUUID());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const box = "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none";
  return (
    <div className="space-y-5 rounded-xl border border-border bg-surface-1 p-5">
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-fg">Who gets it</legend>
        <div className="flex flex-wrap gap-3">
          {AUDIENCES.map((a) => (
            <label key={a.value} className="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                checked={audiences.includes(a.value)}
                onChange={() => setAudiences((l) => toggle(l, a.value))}
              />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-fg">How</legend>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((c) => (
            <label key={c.value} className="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                checked={channels.includes(c.value)}
                onChange={() => setChannels((l) => toggle(l, c.value))}
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-fg">Subject</span>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Practice moved to 8 PM" />
        <span className="text-[12px] text-fg-muted">Players see it as “{teamName}: {subject.trim() || "your subject"}”.</span>
      </label>
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-fg">Message</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={6} className={box} />
      </label>
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : null}
      {result ? (
        <Alert tone="success" role="status">
          {result}
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button onClick={send} disabled={!valid || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send to the team
        </Button>
      </div>
    </div>
  );
}
