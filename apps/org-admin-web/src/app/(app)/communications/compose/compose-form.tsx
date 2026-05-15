"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminBroadcast } from "@/lib/api/browser-api";

type Audience = "captains" | "team_admins" | "players" | "all_admins";
type Channel = "email" | "in_app";

const AUDIENCE_OPTIONS: Array<{
  value: Audience;
  label: string;
  hint: string;
}> = [
  {
    value: "captains",
    label: "Captains",
    hint: "Users holding the captain role on any team in this org."
  },
  {
    value: "team_admins",
    label: "Team admins & coaches",
    hint: "Anyone with team_admin or coach role on a team in this org."
  },
  {
    value: "players",
    label: "Players",
    hint: "Distinct persons with an active membership on a team in this org."
  },
  {
    value: "all_admins",
    label: "Org / league / season / division admins",
    hint: "Every administrative role scoped to this org or any of its leagues."
  }
];

export function ComposeForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [audiences, setAudiences] = useState<Audience[]>(["captains"]);
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    queued: number;
    audiencesResolved: number;
  } | null>(null);

  function toggle(a: Audience) {
    setAudiences((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }

  async function handleSend() {
    setError(null);
    setResult(null);
    if (audiences.length === 0) {
      setError("Pick at least one audience.");
      return;
    }
    if (subject.trim().length < 1) {
      setError("Subject is required.");
      return;
    }
    if (body.trim().length < 1) {
      setError("Body is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await orgAdminBroadcast.send({
        orgId,
        audiences,
        subject: subject.trim(),
        body: body.trim(),
        channel
      });
      setResult({
        queued: res.queued,
        audiencesResolved: res.audiencesResolved
      });
      setSubject("");
      setBody("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Audience</Eyebrow>
      <p className="text-[12px] text-fg-muted">
        Multiple audiences union; the same person shown in two groups still
        gets a single notification.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {AUDIENCE_OPTIONS.map((opt) => {
          const checked = audiences.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors " +
                (checked
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-border-strong")
              }
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.value)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span className="min-w-0">
                <p className="text-sm font-medium text-fg">{opt.label}</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">{opt.hint}</p>
              </span>
            </label>
          );
        })}
      </div>

      <Eyebrow>// Message</Eyebrow>
      <Field label="Subject">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Roster lock moves to Friday"
          disabled={busy}
          maxLength={200}
        />
      </Field>
      <Field label="Body" hint="Plain text. URLs get auto-detected by most clients.">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          disabled={busy}
          maxLength={5000}
          placeholder="Hi captains,&#10;&#10;Just a heads-up — we're moving the roster lock to Friday this season so finance has time to..."
          className="flex w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
        />
      </Field>
      <Field label="Channel">
        <div className="flex gap-1.5">
          {([
            { v: "email", label: "Email" },
            { v: "in_app", label: "In-app" }
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setChannel(opt.v)}
              disabled={busy}
              className={
                "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (channel === opt.v
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          Queued {result.queued} notification{result.queued === 1 ? "" : "s"} for{" "}
          {result.audiencesResolved} recipient{result.audiencesResolved === 1 ? "" : "s"}.
          {result.queued !== result.audiencesResolved ? (
            <>
              {" "}({result.audiencesResolved - result.queued} skipped because
              the row already existed or the recipient opted out.)
            </>
          ) : null}
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
        <Button size="sm" onClick={handleSend} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : null}
          Send broadcast
        </Button>
      </div>
    </div>
  );
}
