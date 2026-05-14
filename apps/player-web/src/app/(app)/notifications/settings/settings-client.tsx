"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { communications } from "@/lib/api/browser-api";

type Channel = "email" | "in_app";

type Item = { templateCode: string; channel: string; enabled: boolean };

/**
 * Curated set of player-facing template codes — most catalog rows
 * are admin-only and shouldn't pollute the settings grid. The ones
 * listed here mirror what actually lands in a player's inbox.
 *
 * Display name + category exist purely to group + label rows; the
 * `code` is the canonical key under the hood.
 */
const PLAYER_TEMPLATES: Array<{
  code: string;
  label: string;
  description: string;
  category: string;
}> = [
  // ── Registration lifecycle
  {
    code: "registration.approved",
    label: "Registration approved",
    description: "When an admin approves your season registration.",
    category: "Registration"
  },
  {
    code: "registration.rejected",
    label: "Registration declined",
    description: "When an admin denies your season registration.",
    category: "Registration"
  },
  {
    code: "registration.waitlisted",
    label: "Waitlisted",
    description: "When you're placed on a season waitlist.",
    category: "Registration"
  },
  // ── Team join requests
  {
    code: "PLAYER_JOIN_APPROVED",
    label: "Captain accepted you",
    description: "When a team captain accepts your join request.",
    category: "Team activity"
  },
  {
    code: "PLAYER_JOIN_REJECTED",
    label: "Captain declined you",
    description: "When a team captain declines your join request.",
    category: "Team activity"
  },
  {
    code: "TEAM_INVITE_NEW",
    label: "Team invite received",
    description: "When a captain reserves a spot for you on their team.",
    category: "Team activity"
  },
  {
    code: "DROP_CONFIRMED",
    label: "Removed from roster",
    description: "When a captain drops you from a roster.",
    category: "Team activity"
  },
  // ── Money
  {
    code: "invoice.created",
    label: "New invoice",
    description: "When an invoice is issued to you.",
    category: "Payments"
  },
  {
    code: "payment.confirmed",
    label: "Payment received",
    description: "When we successfully process a payment from you.",
    category: "Payments"
  },
  {
    code: "installment.failed",
    label: "Installment failed",
    description: "When a scheduled card payment fails.",
    category: "Payments"
  },
  {
    code: "invoice.overdue.r1",
    label: "Overdue reminder · 1+ day",
    description: "Friendly first reminder when an invoice goes past due.",
    category: "Payments"
  },
  {
    code: "invoice.overdue.r2",
    label: "Overdue reminder · 7+ days",
    description: "Second reminder a week into past-due.",
    category: "Payments"
  },
  {
    code: "invoice.overdue.r3",
    label: "Overdue reminder · 14+ days",
    description: "Urgent reminder two weeks past due.",
    category: "Payments"
  },
  {
    code: "refund.issued",
    label: "Refund issued",
    description: "When we send a refund your way.",
    category: "Payments"
  },
  // ── Compliance
  {
    code: "USA_HOCKEY_EXPIRING_SOON",
    label: "Membership expiring soon",
    description: "Heads-up before your governing-body membership lapses.",
    category: "Compliance"
  },
  {
    code: "USA_HOCKEY_EXPIRED",
    label: "Membership expired",
    description: "After your governing-body membership lapses.",
    category: "Compliance"
  }
];

const CHANNELS: Channel[] = ["email", "in_app"];

export function SettingsClient({
  initialItems
}: {
  initialTemplates: string[];
  initialItems: Item[];
}) {
  // Map from `${templateCode}|${channel}` → enabled.
  const initialMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const it of initialItems) {
      m.set(`${it.templateCode}|${it.channel}`, it.enabled);
    }
    return m;
  }, [initialItems]);

  const [state, setState] = useState<Map<string, boolean>>(initialMap);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function isEnabled(code: string, channel: Channel): boolean {
    return state.get(`${code}|${channel}`) ?? true;
  }

  async function toggle(code: string, channel: Channel) {
    const key = `${code}|${channel}`;
    const current = isEnabled(code, channel);
    const next = !current;
    // Optimistic update
    setState((prev) => {
      const m = new Map(prev);
      m.set(key, next);
      return m;
    });
    setBusy(key);
    setError(null);
    try {
      await communications.setPreference(code, channel, { enabled: next });
    } catch (e) {
      // Roll back
      setState((prev) => {
        const m = new Map(prev);
        m.set(key, current);
        return m;
      });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const categories = useMemo(() => {
    const grouped = new Map<string, typeof PLAYER_TEMPLATES>();
    for (const t of PLAYER_TEMPLATES) {
      const arr = grouped.get(t.category) ?? [];
      arr.push(t);
      grouped.set(t.category, arr);
    }
    return Array.from(grouped.entries());
  }, []);

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {categories.map(([category, rows]) => (
        <section
          key={category}
          className="rounded-xl border border-border bg-surface-1"
        >
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // {category.toLowerCase()}
            </p>
            <div className="hidden gap-8 font-mono text-[10px] uppercase tracking-widest text-fg-muted sm:flex">
              <span className="w-12 text-right">Email</span>
              <span className="w-12 text-right">In-app</span>
            </div>
          </header>
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <li
                key={t.code}
                className="grid grid-cols-1 gap-3 px-5 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="text-[14px] font-medium text-fg">{t.label}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {t.description}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {t.code}
                  </p>
                </div>
                <div className="flex items-center gap-6 sm:gap-8">
                  {CHANNELS.map((channel) => (
                    <ToggleCell
                      key={channel}
                      enabled={isEnabled(t.code, channel)}
                      busy={busy === `${t.code}|${channel}`}
                      onClick={() => toggle(t.code, channel)}
                      ariaLabel={`${t.label} · ${channel}`}
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
          ? "border-emerald-500/60 bg-emerald-500/30"
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
