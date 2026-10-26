"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Field, Input } from "@sportspulse/ui";
import { WebPushControl } from "@sportspulse/admin-pages";
import type { NotificationChannelStatus, NotificationPreferenceChannel } from "@sportspulse/api-client";
import { communications } from "@/lib/api/browser-api";

type Channel = NotificationPreferenceChannel;

type Item = { templateCode: string; channel: string; enabled: boolean };
type Topic = {
  key: string;
  label: string;
  description: string;
  category: string;
  codes: string[];
};

const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", in_app: "In-app", sms: "Text", push: "Push" };

/**
 * One row per topic from the API catalog (GET /notifications/me/preferences
 * `topics`), so the page and the server always agree on which codes exist.
 * A topic is on for a channel when every code in it is on (a code with no
 * saved row takes the channel default: text off, the rest on); switching
 * it writes all of its codes in one request.
 *
 * Text and push columns appear only when they can deliver: text needs the
 * league's SMS provider and a number on file, push needs push set up.
 * Otherwise the section above says so plainly, instead of a toggle that
 * would do nothing.
 */
export function SettingsClient({
  topics,
  channels,
  channelDefaults,
  channelStatus,
  sms,
  initialItems
}: {
  topics: Topic[];
  channels: Channel[];
  channelDefaults: Record<Channel, boolean>;
  channelStatus: NotificationChannelStatus | null;
  sms: { phoneMasked: string | null; hasPhone: boolean };
  initialItems: Item[];
}) {
  const initialMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const it of initialItems) m.set(`${it.templateCode}|${it.channel}`, it.enabled);
    return m;
  }, [initialItems]);

  const [state, setState] = useState<Map<string, boolean>>(initialMap);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(sms);

  const smsReady = !!channelStatus?.sms.available && phone.hasPhone;
  const pushReady = !!channelStatus?.push.available;
  const shown = channels.filter(
    (c) => c === "email" || c === "in_app" || (c === "sms" && smsReady) || (c === "push" && pushReady)
  );

  function isEnabled(topic: Topic, channel: Channel): boolean {
    return topic.codes.every((c) => state.get(`${c}|${channel}`) ?? channelDefaults[channel] ?? true);
  }

  function setTopic(m: Map<string, boolean>, topic: Topic, channel: Channel, on: boolean) {
    const next = new Map(m);
    for (const c of topic.codes) next.set(`${c}|${channel}`, on);
    return next;
  }

  async function toggle(topic: Topic, channel: Channel) {
    const key = `${topic.key}|${channel}`;
    const before = state;
    const next = !isEnabled(topic, channel);
    setState((prev) => setTopic(prev, topic, channel, next));
    setBusy(key);
    setError(null);
    try {
      await communications.setTopicPreference(topic.key, channel, { enabled: next });
    } catch (e) {
      setState(before);
      setError(`Could not save "${topic.label}": ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const categories = useMemo(() => {
    const grouped = new Map<string, Topic[]>();
    for (const t of topics) {
      const arr = grouped.get(t.category) ?? [];
      arr.push(t);
      grouped.set(t.category, arr);
    }
    return Array.from(grouped.entries());
  }, [topics]);

  if (topics.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface-1 px-4 py-3 text-sm text-fg-muted">
        Notification settings could not be loaded. Reload the page to try again.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md bg-[var(--tint-rose-bg)] px-3 py-2 text-sm text-[var(--tint-rose-fg)]">
          {error}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-1 p-5" data-testid="sms-settings">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Text messages</h2>
          {!channelStatus?.sms.available ? (
            <p className="mt-2 text-[13px] text-fg-muted">Text messages are not set up.</p>
          ) : (
            <SmsNumberForm
              phone={phone}
              onSaved={(next) => {
                setPhone(next);
                // Removing the number switched every text topic off on the server.
                if (!next.hasPhone) {
                  setState((prev) => {
                    const m = new Map(prev);
                    for (const k of m.keys()) if (k.endsWith("|sms")) m.set(k, false);
                    return m;
                  });
                }
              }}
            />
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">Push on this browser</h2>
          <WebPushControl
            api={{
              config: () => communications.pushConfig(),
              subscribe: (b) => communications.pushSubscribe(b),
              unsubscribeEndpoint: (endpoint) => communications.pushUnsubscribeEndpoint(endpoint)
            }}
          />
        </div>
      </section>

      {categories.map(([category, rows]) => (
        <section key={category} className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{category}</h2>
            <div className="hidden gap-8 font-mono text-[10px] uppercase tracking-widest text-fg-muted sm:flex">
              {shown.map((c) => (
                <span key={c} className="w-12 text-right">{CHANNEL_LABEL[c]}</span>
              ))}
            </div>
          </header>
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <li
                key={t.key}
                className="grid grid-cols-1 gap-3 px-5 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="text-[14px] font-medium text-fg">{t.label}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">{t.description}</p>
                </div>
                <div className="flex items-center gap-6 sm:gap-8">
                  {shown.map((channel) => (
                    <ToggleCell
                      key={channel}
                      enabled={isEnabled(t, channel)}
                      busy={busy === `${t.key}|${channel}`}
                      onClick={() => toggle(t, channel)}
                      ariaLabel={`${t.label} by ${CHANNEL_LABEL[channel].toLowerCase()}`}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SmsNumberForm({
  phone,
  onSaved
}: {
  phone: { phoneMasked: string | null; hasPhone: boolean };
  onSaved: (next: { phoneMasked: string | null; hasPhone: boolean }) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await communications.setSmsNumber({ phone: next });
      onSaved({ phoneMasked: res.phoneMasked, hasPhone: res.hasPhone });
      setValue("");
      setSaved(res.hasPhone ? "Number saved. Turn text on for the topics you want below." : "Number removed. Text messages are off.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="text-[13px] text-fg-muted">
        {phone.hasPhone
          ? `Texts go to ${phone.phoneMasked ?? "your number"}. Text is off for every topic until you turn it on.`
          : "Add a mobile number to get texts. Message and data rates may apply."}
      </p>
      <Field label={phone.hasPhone ? "New mobile number" : "Mobile number"} htmlFor="sms-number">
        <Input
          id="sms-number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="(415) 555-2671"
          disabled={busy}
          maxLength={40}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !value.trim()} onClick={() => void save(value)}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Save number
        </Button>
        {phone.hasPhone ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save("")}>
            Remove number
          </Button>
        ) : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success" role="status">{saved}</Alert> : null}
    </div>
  );
}

function ToggleCell({
  enabled,
  busy,
  onClick,
  ariaLabel
}: {
  enabled: boolean;
  busy: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      aria-pressed={enabled}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        enabled
          ? "border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)]"
          : "border-border bg-bg-subtle"
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-fg shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-0.5"
        ].join(" ")}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin text-bg" strokeWidth={2} />
        ) : null}
      </span>
    </button>
  );
}
