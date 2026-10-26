"use client";

/**
 * League announcement composer (UC-19), shared by superadmin-web (super,
 * org and league admins) and org-admin-web. Who (audiences), where (a
 * part of the org the caller reaches, picked from lists the server built
 * with the same rule it checks on send), how (email, in-app or both;
 * people who turned on text or push for Announcements also get those),
 * when (now, or a scheduled time the server's job honours, cancellable
 * until it goes) and with what (up to 5 files, linked by signed links).
 *
 * Transport-agnostic: the app injects `send` (its own browser SDK) and
 * the `reach` from GET /org-admin/broadcast/targets. Never sends an id
 * typed by hand.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { Alert, Badge, Button, Eyebrow, Field, Input, Select } from "@sportspulse/ui";
import type {
  AnnouncementReach,
  BroadcastAttachment,
  NotificationChannelStatus,
  ScheduledBroadcast
} from "@sportspulse/api-client";

export type AnnouncementAudience = "captains" | "coaches" | "players" | "referees" | "all_admins";
export type AnnouncementChannel = "email" | "in_app";
export type AnnouncementTargetType = "org" | "league" | "season" | "division" | "team";

export interface AnnouncementSendBody {
  orgId: string;
  audiences: AnnouncementAudience[];
  targetType: AnnouncementTargetType;
  targetId?: string;
  subject: string;
  body: string;
  channels: AnnouncementChannel[];
  idempotencyKey: string;
  /** ISO time to send later. */
  sendAt?: string;
  attachmentIds?: string[];
}

export interface AnnouncementSendResult {
  recipients: number;
  queued: number;
  failed: number;
  noEmail: number;
  idempotent: boolean;
  /** Present when the announcement was scheduled instead of sent. */
  scheduled?: ScheduledBroadcast;
}

export interface AnnouncementComposerProps {
  reach: AnnouncementReach;
  /** Orgs the caller reaches. With two or more an org picker shows. */
  orgs?: Array<{ id: string; name: string }>;
  onOrgChange?: (orgId: string) => void;
  /** Preselect a target, e.g. when opened from a team page. Ignored when outside the reach. */
  initialTarget?: { type: AnnouncementTargetType; id?: string } | null;
  send: (body: AnnouncementSendBody) => Promise<AnnouncementSendResult>;
  onSent?: () => void;
  onCancel?: () => void;
  /** Attachments (UC-19). Without it the attach control is hidden. */
  uploadAttachment?: (body: { orgId: string; fileName: string; dataBase64: string }) => Promise<BroadcastAttachment>;
  removeAttachment?: (id: string) => Promise<unknown>;
  /** Scheduled announcements of this org, with cancel. Without it the list is hidden. */
  listScheduled?: (orgId: string) => Promise<{ items: ScheduledBroadcast[] }>;
  cancelScheduled?: (id: string) => Promise<{ scheduled: ScheduledBroadcast }>;
  /** Which channels can deliver, to say so next to the channel picker. */
  loadChannelStatus?: () => Promise<NotificationChannelStatus>;
}

const AUDIENCE_OPTIONS: Array<{ value: AnnouncementAudience; label: string; hint: string }> = [
  { value: "players", label: "Players", hint: "Everyone with an active spot on a team in the chosen part." },
  { value: "captains", label: "Captains", hint: "Captains of those teams." },
  { value: "coaches", label: "Coaches", hint: "Coaches of those teams." },
  { value: "referees", label: "Referees", hint: "Referees of the league or leagues involved." },
  {
    value: "all_admins",
    label: "Org / league / season / division admins",
    hint: "Admins of this org and of the chosen league, season or division."
  }
];

const TARGET_LABEL: Record<AnnouncementTargetType, string> = {
  org: "The whole organisation",
  league: "One league",
  season: "One season",
  division: "One division",
  team: "One team"
};

const PICKER_LABEL: Record<Exclude<AnnouncementTargetType, "org">, string> = {
  league: "League",
  season: "Season",
  division: "Division",
  team: "Team"
};

const CHANNEL_OPTIONS: Array<{ value: AnnouncementChannel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-app" }
];

/** "2026-10-27T09:30" in the browser's zone for an input[type=datetime-local]. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const SCHEDULED_LABEL: Record<ScheduledBroadcast["status"], string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
  failed: "Could not send"
};

function newKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
}

type Option = { id: string; label: string };

/** Picker lists with readable labels ("League · Season · Division"). */
function targetLists(reach: AnnouncementReach): Record<Exclude<AnnouncementTargetType, "org">, Option[]> {
  const leagueName = new Map(reach.leagues.map((l) => [l.id, l.name]));
  const seasonLabel = new Map(
    reach.seasons.map((s) => [s.id, `${leagueName.get(s.leagueId) ?? "League"} · ${s.name}`])
  );
  const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label);
  return {
    league: reach.leagues.map((l) => ({ id: l.id, label: l.name })).sort(byLabel),
    season: reach.seasons.map((s) => ({ id: s.id, label: seasonLabel.get(s.id) ?? s.name })).sort(byLabel),
    division: reach.divisions
      .map((d) => ({ id: d.id, label: `${seasonLabel.get(d.seasonId) ?? "Season"} · ${d.name}` }))
      .sort(byLabel),
    team: reach.teams.map((t) => ({ id: t.id, label: t.name })).sort(byLabel)
  };
}

/**
 * Default target: the one the page was opened for when the caller
 * reaches it; else the whole org for org admins; else the caller's
 * league when they have exactly one; else an empty league picker.
 */
function defaultTarget(
  reach: AnnouncementReach,
  lists: ReturnType<typeof targetLists>,
  initial: AnnouncementComposerProps["initialTarget"]
): { type: AnnouncementTargetType; id: string } {
  if (initial) {
    if (initial.type === "org" && reach.wholeOrg) return { type: "org", id: "" };
    if (initial.type !== "org" && initial.id && lists[initial.type].some((o) => o.id === initial.id)) {
      return { type: initial.type, id: initial.id };
    }
  }
  if (reach.wholeOrg) return { type: "org", id: "" };
  for (const type of ["league", "season", "division", "team"] as const) {
    const list = lists[type];
    if (list.length > 0) return { type, id: list.length === 1 ? list[0]!.id : "" };
  }
  return { type: "league", id: "" };
}

export function AnnouncementComposer({
  reach,
  orgs = [],
  onOrgChange,
  initialTarget,
  send,
  onSent,
  onCancel,
  uploadAttachment,
  removeAttachment,
  listScheduled,
  cancelScheduled,
  loadChannelStatus
}: AnnouncementComposerProps) {
  const lists = useMemo(() => targetLists(reach), [reach]);
  const start = useMemo(() => defaultTarget(reach, lists, initialTarget), [reach, lists, initialTarget]);
  const targetTypes = useMemo(
    () =>
      (["org", "league", "season", "division", "team"] as const).filter((t) =>
        t === "org" ? reach.wholeOrg : lists[t].length > 0
      ),
    [reach, lists]
  );

  const [audiences, setAudiences] = useState<AnnouncementAudience[]>(["players"]);
  const [targetType, setTargetType] = useState<AnnouncementTargetType>(start.type);
  const [targetId, setTargetId] = useState<string>(start.id);
  const [channels, setChannels] = useState<AnnouncementChannel[]>(["email", "in_app"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per composed announcement: a retry after an error cannot
  // send it twice. Renewed after a successful send.
  const [idemKey, setIdemKey] = useState<string>(newKey);
  const [result, setResult] = useState<AnnouncementSendResult | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [sendAt, setSendAt] = useState<string>("");
  const [files, setFiles] = useState<BroadcastAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledBroadcast[] | null>(null);
  const [scheduledError, setScheduledError] = useState<string | null>(null);

  async function loadScheduled() {
    if (!listScheduled) return;
    try {
      const res = await listScheduled(reach.orgId);
      setScheduled(res.items);
      setScheduledError(null);
    } catch (e) {
      setScheduledError((e as Error).message);
    }
  }

  const [channelStatus, setChannelStatus] = useState<NotificationChannelStatus | null>(null);
  useEffect(() => {
    loadChannelStatus?.().then(setChannelStatus).catch(() => setChannelStatus(null));
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadScheduled();
    // Reload when the org changes; listScheduled is rebuilt by the parent each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reach.orgId]);

  async function onFiles(list: FileList | null) {
    if (!list || !uploadAttachment) return;
    setError(null);
    const picked = Array.from(list);
    if (files.length + picked.length > 5) return setError("Attach up to 5 files.");
    setUploading(true);
    try {
      for (const f of picked) {
        if (f.size > 3 * 1024 * 1024) throw new Error(`${f.name} is over 3 MB.`);
        const saved = await uploadAttachment({ orgId: reach.orgId, fileName: f.name, dataBase64: await fileToBase64(f) });
        setFiles((prev) => [...prev, saved]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function dropFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    await removeAttachment?.(id).catch(() => undefined);
  }

  async function cancel(id: string) {
    if (!cancelScheduled) return;
    setScheduledError(null);
    try {
      const res = await cancelScheduled(id);
      setScheduled((prev) => (prev ?? []).map((x) => (x.id === id ? res.scheduled : x)));
    } catch (e) {
      setScheduledError((e as Error).message);
      void loadScheduled();
    }
  }

  const targetList = targetType === "org" ? [] : lists[targetType];
  const orgName = orgs.find((o) => o.id === reach.orgId)?.name ?? "this organisation";

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function handleSend() {
    setError(null);
    setResult(null);
    if (audiences.length === 0) return setError("Pick at least one audience.");
    if (targetType !== "org" && !targetId) return setError(`Pick the ${targetType} to send to.`);
    if (channels.length === 0) return setError("Pick at least one channel.");
    if (subject.trim().length < 1) return setError("Subject is required.");
    if (body.trim().length < 1) return setError("Body is required.");
    let sendAtIso: string | undefined;
    if (when === "later") {
      const t = sendAt ? new Date(sendAt) : null;
      if (!t || Number.isNaN(t.getTime())) return setError("Pick the date and time to send.");
      if (t.getTime() < Date.now() + 2 * 60 * 1000) return setError("Pick a time at least 2 minutes from now, or send it now.");
      sendAtIso = t.toISOString();
    }
    setBusy(true);
    try {
      const res = await send({
        orgId: reach.orgId,
        audiences,
        targetType,
        ...(targetType === "org" ? {} : { targetId }),
        subject: subject.trim(),
        body: body.trim(),
        channels,
        idempotencyKey: idemKey,
        ...(sendAtIso ? { sendAt: sendAtIso } : {}),
        ...(files.length ? { attachmentIds: files.map((f) => f.id) } : {})
      });
      setResult(res);
      setSubject("");
      setBody("");
      setFiles([]);
      setSendAt("");
      setWhen("now");
      setIdemKey(newKey());
      if (res.scheduled) void loadScheduled();
      onSent?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-6" data-testid="announcement-composer">
      <Eyebrow>Send to</Eyebrow>
      {orgs.length > 1 && onOrgChange ? (
        <Field label="Organisation" htmlFor="compose-org">
          <Select
            id="compose-org"
            value={reach.orgId}
            disabled={busy}
            onChange={(e) => onOrgChange(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {targetTypes.length === 0 ? (
        <Alert tone="warning">
          {orgName} has nothing you can send to yet. A league admin can send to teams once they are placed in a division of the league.
        </Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Part of the organisation"
            htmlFor="compose-target-type"
            hint={reach.wholeOrg ? undefined : "You can send to the leagues you run and everything in them."}
          >
            <Select
              id="compose-target-type"
              value={targetType}
              disabled={busy}
              onChange={(e) => {
                const t = e.target.value as AnnouncementTargetType;
                setTargetType(t);
                const list = t === "org" ? [] : lists[t];
                setTargetId(list.length === 1 ? list[0]!.id : "");
              }}
            >
              {targetTypes.map((t) => (
                <option key={t} value={t}>
                  {TARGET_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          {targetType !== "org" ? (
            <Field label={PICKER_LABEL[targetType]} htmlFor="compose-target">
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
      )}

      <Eyebrow>Audience</Eyebrow>
      <p className="text-[12px] text-fg-muted">A person in two groups still gets one message per channel.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {AUDIENCE_OPTIONS.map((opt) => {
          const checked = audiences.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors " +
                (checked ? "border-accent bg-accent/5" : "border-border hover:border-border-strong")
              }
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setAudiences((prev) => toggle(prev, opt.value))}
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
      <Field label="Subject" htmlFor="compose-subject">
        <Input
          id="compose-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Roster lock moves to Friday"
          disabled={busy}
          maxLength={200}
        />
      </Field>
      <Field label="Body" htmlFor="compose-body" hint="Plain text. Paste links as full URLs.">
        <textarea
          id="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          disabled={busy}
          maxLength={5000}
          placeholder="Hi captains, the roster lock moves to Friday this season."
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
                onClick={() => setChannels((prev) => toggle(prev, opt.value))}
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
      <p className="text-[12px] text-fg-muted" data-testid="compose-mobile-note">
        People who turned on text messages or push for Announcements in their settings also get it that way.
        {channelStatus && !channelStatus.sms.available ? " Text messages are not set up." : ""}
        {channelStatus && !channelStatus.push.available ? " Push notifications are not set up." : ""}
      </p>

      {uploadAttachment ? (
        <Field label="Attachments" hint="Up to 5 files: PDF, PNG, JPEG or WebP, 3 MB each. The message links to them.">
          <div className="space-y-2">
            {files.length ? (
              <ul className="space-y-1" data-testid="compose-attachments">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-[13px] text-fg">
                    <span className="truncate">{f.fileName}</span>
                    <button
                      type="button"
                      onClick={() => void dropFile(f.id)}
                      disabled={busy}
                      aria-label={`Remove ${f.fileName}`}
                      className="text-fg-muted hover:text-fg"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy || uploading || files.length >= 5} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}
              {uploading ? "Uploading…" : "Attach a file"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Attach files"
              data-testid="compose-attach-input"
              onChange={(e) => {
                const l = e.target.files;
                void onFiles(l).finally(() => {
                  e.target.value = "";
                });
              }}
            />
          </div>
        </Field>
      ) : null}

      <Field label="When" htmlFor="compose-when">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            id="compose-when"
            value={when}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value as "now" | "later";
              setWhen(v);
              if (v === "later" && !sendAt) setSendAt(localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
            }}
          >
            <option value="now">Send now</option>
            <option value="later">Schedule for later</option>
          </Select>
          {when === "later" ? (
            <Input
              type="datetime-local"
              aria-label="Send at"
              data-testid="compose-send-at"
              value={sendAt}
              min={localInputValue(new Date(Date.now() + 2 * 60 * 1000))}
              onChange={(e) => setSendAt(e.target.value)}
              disabled={busy}
            />
          ) : null}
        </div>
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {result?.scheduled ? (
        <Alert tone="success">
          {result.idempotent ? "Already scheduled. " : ""}Scheduled for {fmtWhen(result.scheduled.sendAt)}. You can cancel it below until it goes.
        </Alert>
      ) : result ? (
        <Alert tone={result.failed > 0 ? "warning" : "success"}>
          {result.idempotent ? "Already sent. " : ""}
          {result.queued} message{result.queued === 1 ? "" : "s"} queued for {result.recipients} recipient
          {result.recipients === 1 ? "" : "s"}.
          {result.recipients === 0 ? " Nobody matches that audience in the chosen part." : ""}
          {result.noEmail > 0
            ? ` ${result.noEmail} ${result.noEmail === 1 ? "person has" : "people have"} no email address on file, so no email went to them.`
            : ""}
          {result.failed > 0 ? ` ${result.failed} could not be written. Check the outbox before resending.` : ""}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button size="sm" onClick={handleSend} disabled={busy || targetTypes.length === 0}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
          {when === "later" ? "Schedule broadcast" : "Send broadcast"}
        </Button>
      </div>

      {listScheduled ? (
        <div className="space-y-2 border-t border-border pt-4" data-testid="scheduled-broadcasts">
          <Eyebrow>Scheduled</Eyebrow>
          {scheduledError ? <Alert tone="error">{scheduledError}</Alert> : null}
          {scheduled === null ? (
            <p className="text-[12px] text-fg-muted">Loading…</p>
          ) : scheduled.length === 0 ? (
            <p className="text-[12px] text-fg-muted">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-border">
              {scheduled.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-scheduled-id={x.id}>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-fg">{x.subject}</p>
                    <p className="text-[12px] text-fg-muted">
                      {x.status === "sent" && x.sentAt ? `Sent ${fmtWhen(x.sentAt)}` : `For ${fmtWhen(x.sendAt)}`}
                      {x.attachments.length ? ` · ${x.attachments.length} file${x.attachments.length === 1 ? "" : "s"}` : ""}
                      {x.status === "sent" && x.result ? ` · ${x.result.queued} queued` : ""}
                      {x.status === "failed" && x.lastError ? ` · ${x.lastError}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge mono tone={x.status === "sent" ? "success" : x.status === "failed" ? "danger" : x.status === "cancelled" ? "neutral" : "info"}>
                      {SCHEDULED_LABEL[x.status]}
                    </Badge>
                    {x.status === "scheduled" && cancelScheduled ? (
                      <Button size="sm" variant="outline" onClick={() => void cancel(x.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
