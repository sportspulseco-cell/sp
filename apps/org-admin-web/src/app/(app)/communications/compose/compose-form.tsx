"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Button, Eyebrow, Field, Input, Select } from "@sportspulse/ui";
import { orgAdminBroadcast } from "@/lib/api/browser-api";

type Audience = "captains" | "coaches" | "players" | "referees" | "all_admins";
type Channel = "email" | "in_app";
type TargetType = "org" | "league" | "season" | "division" | "team";

export type ComposeTargets = Record<
  Exclude<TargetType, "org">,
  Array<{ id: string; label: string }>
>;

const AUDIENCE_OPTIONS: Array<{
  value: Audience;
  label: string;
  hint: string;
}> = [
  {
    value: "players",
    label: "Players",
    hint: "Everyone with an active spot on a team in the chosen part of the org."
  },
  {
    value: "captains",
    label: "Captains",
    hint: "Captains of those teams."
  },
  {
    value: "coaches",
    label: "Coaches",
    hint: "Coaches of those teams."
  },
  {
    value: "referees",
    label: "Referees",
    hint: "Referees of the league or leagues involved."
  },
  {
    value: "all_admins",
    label: "Org / league / season / division admins",
    hint: "Admins of this org and of the chosen league, season or division."
  }
];

const TARGET_OPTIONS: Array<{ value: TargetType; label: string }> = [
  { value: "org", label: "The whole organisation" },
  { value: "league", label: "One league" },
  { value: "season", label: "One season" },
  { value: "division", label: "One division" },
  { value: "team", label: "One team" }
];

const TARGET_LABEL: Record<Exclude<TargetType, "org">, string> = {
  league: "League",
  season: "Season",
  division: "Division",
  team: "Team"
};

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-app" }
];

function newKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
}

/**
 * League announcement (UC-19). Who (audiences), where (whole org or one
 * league / season / division / team picked from the org's own lists),
 * how (email, in-app or both). The server checks the target is in this
 * org and works out the recipients; this form never sends ids typed by
 * hand.
 */
export function ComposeForm({
  orgId,
  targets
}: {
  orgId: string;
  targets: ComposeTargets;
}) {
  const router = useRouter();
  const [audiences, setAudiences] = useState<Audience[]>(["players"]);
  const [targetType, setTargetType] = useState<TargetType>("org");
  const [targetId, setTargetId] = useState<string>("");
  const [channels, setChannels] = useState<Channel[]>(["email", "in_app"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per composed announcement: a retry after an error cannot
  // send it twice. Renewed after a successful send.
  const [idemKey, setIdemKey] = useState<string>(newKey);
  const [result, setResult] = useState<{
    recipients: number;
    queued: number;
    failed: number;
    noEmail: number;
    idempotent: boolean;
  } | null>(null);

  const targetList = targetType === "org" ? [] : targets[targetType];

  function toggleAudience(a: Audience) {
    setAudiences((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }
  function toggleChannel(c: Channel) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  async function handleSend() {
    setError(null);
    setResult(null);
    if (audiences.length === 0) {
      setError("Pick at least one audience.");
      return;
    }
    if (targetType !== "org" && !targetId) {
      setError(`Pick the ${targetType} to send to.`);
      return;
    }
    if (channels.length === 0) {
      setError("Pick at least one channel.");
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
        targetType,
        ...(targetType === "org" ? {} : { targetId }),
        subject: subject.trim(),
        body: body.trim(),
        channels,
        idempotencyKey: idemKey
      });
      setResult({
        recipients: res.recipients,
        queued: res.queued,
        failed: res.failed,
        noEmail: res.noEmail,
        idempotent: res.idempotent
      });
      setSubject("");
      setBody("");
      setIdemKey(newKey());
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>Send to</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Part of the organisation" htmlFor="compose-target-type">
          <Select
            id="compose-target-type"
            value={targetType}
            disabled={busy}
            onChange={(e) => {
              setTargetType(e.target.value as TargetType);
              setTargetId("");
            }}
          >
            {TARGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {targetType !== "org" ? (
          <Field
            label={TARGET_LABEL[targetType]}
            htmlFor="compose-target"
            hint={
              targetList.length === 0
                ? `This organisation has no ${targetType}s yet.`
                : undefined
            }
          >
            <Select
              id="compose-target"
              value={targetId}
              disabled={busy || targetList.length === 0}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Pick a {targetType}…</option>
              {targetList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <Eyebrow>Audience</Eyebrow>
      <p className="text-[12px] text-fg-muted">
        A person in two groups still gets one message per channel.
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
                onChange={() => toggleAudience(opt.value)}
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

      <Eyebrow>Message</Eyebrow>
      <Field label="Subject">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Roster lock moves to Friday"
          disabled={busy}
          maxLength={200}
        />
      </Field>
      <Field label="Body" hint="Plain text. Paste links as full URLs.">
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
      <Field label="Channels" hint="Pick one or both. Each recipient gets one message per channel.">
        <div className="flex gap-1.5">
          {CHANNEL_OPTIONS.map((opt) => {
            const on = channels.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleChannel(opt.value)}
                disabled={busy}
                className={
                  "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                  (on
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border text-fg-muted hover:border-border-strong hover:text-fg")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {result ? (
        <Alert tone={result.failed > 0 ? "warning" : "success"}>
          {result.idempotent ? "Already sent. " : ""}
          {result.queued} message{result.queued === 1 ? "" : "s"} queued for{" "}
          {result.recipients} recipient{result.recipients === 1 ? "" : "s"}.
          {result.recipients === 0
            ? " Nobody matches that audience in the chosen part of the organisation."
            : ""}
          {result.noEmail > 0
            ? ` ${result.noEmail} ${result.noEmail === 1 ? "person has" : "people have"} no email address on file, so no email went to them.`
            : ""}
          {result.failed > 0
            ? ` ${result.failed} could not be written. Check the outbox before resending.`
            : ""}
        </Alert>
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
