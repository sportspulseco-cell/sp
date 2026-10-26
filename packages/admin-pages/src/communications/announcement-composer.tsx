"use client";

/**
 * League announcement composer (UC-19), shared by superadmin-web (super,
 * org and league admins) and org-admin-web. Who (audiences), where (a
 * part of the org the caller reaches, picked from lists the server built
 * with the same rule it checks on send), how (email, in-app or both).
 *
 * Transport-agnostic: the app injects `send` (its own browser SDK) and
 * the `reach` from GET /org-admin/broadcast/targets. Never sends an id
 * typed by hand.
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Eyebrow, Field, Input, Select } from "@sportspulse/ui";
import type { AnnouncementReach } from "@sportspulse/api-client";

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
}

export interface AnnouncementSendResult {
  recipients: number;
  queued: number;
  failed: number;
  noEmail: number;
  idempotent: boolean;
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
  onCancel
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
        idempotencyKey: idemKey
      });
      setResult(res);
      setSubject("");
      setBody("");
      setIdemKey(newKey());
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

      {error ? <Alert tone="error">{error}</Alert> : null}
      {result ? (
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
          Send broadcast
        </Button>
      </div>
    </div>
  );
}
