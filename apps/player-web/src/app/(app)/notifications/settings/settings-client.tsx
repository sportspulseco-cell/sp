"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { communications } from "@/lib/api/browser-api";

type Channel = "email" | "in_app";

type Item = { templateCode: string; channel: string; enabled: boolean };
type Topic = {
  key: string;
  label: string;
  description: string;
  category: string;
  codes: string[];
};

const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", in_app: "In-app" };

/**
 * One row per topic from the API catalog (GET /notifications/me/preferences
 * `topics`), so the page and the server always agree on which codes exist.
 * A topic is on for a channel when every code in it is on; switching it
 * writes all of its codes in one request.
 */
export function SettingsClient({
  topics,
  channels,
  initialItems
}: {
  topics: Topic[];
  channels: Channel[];
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

  function isEnabled(topic: Topic, channel: Channel): boolean {
    return topic.codes.every((c) => state.get(`${c}|${channel}`) ?? true);
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

      {categories.map(([category, rows]) => (
        <section key={category} className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{category}</h2>
            <div className="hidden gap-8 font-mono text-[10px] uppercase tracking-widest text-fg-muted sm:flex">
              {channels.map((c) => (
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
                  {channels.map((channel) => (
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
