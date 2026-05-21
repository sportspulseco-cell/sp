"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2 } from "lucide-react";
import { registration } from "@/lib/api/browser-api";

/**
 * Rendered on /registrations/[id] when the registration has a
 * season but no division (legacy rows pre-dating P2-2's funnel
 * division step). The player picks a division inline and
 * PATCH /registration/self/registrations/:id/division persists it.
 *
 * Once assigned, /registrations/[id]/teams narrows to teams with
 * an active DTE in that division (the same path the funnel takes
 * for new submissions).
 */
export function LegacyDivisionPrompt({
  registrationId,
  divisions
}: {
  registrationId: string;
  divisions: Array<{ id: string; name: string; tier: string | null }>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>(divisions[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await registration.setMyRegistrationDivision(registrationId, picked);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] p-5 dark:bg-[var(--tint-amber-bg)]">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)] ring-1 ring-[var(--tint-amber-fg)]/40">
          <Layers className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Pick a division to complete your registration
          </p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            Your registration isn&apos;t tied to a specific division yet.
            Captains can only see your join request if it matches their
            team&apos;s division — pick one to unlock the Find-a-team flow.
          </p>
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Division</span>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.tier ? ` · Tier ${d.tier}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || !picked}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--warning)] px-3 py-2 text-[13px] font-medium text-white hover:bg-[var(--warning)] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Save division"
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-[var(--tint-rose-bg)] px-3 py-2 text-[12px] text-[var(--tint-rose-fg)]">
          {error}
        </p>
      )}
    </section>
  );
}
