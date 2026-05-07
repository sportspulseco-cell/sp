"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import { Button, Field, Input } from "@sportspulse/ui";
import { leagueMgmt } from "@/lib/api/browser-api";

/**
 * Captain-side edit for a team's display profile. Only the safe-to-rename
 * fields are exposed (name, short name) — sport, org, and division are
 * locked behind league_admin.
 */
export function TeamProfileForm({
  teamId,
  initial
}: {
  teamId: string;
  initial: { name: string; shortName: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty =
    form.name !== initial.name || form.shortName !== initial.shortName;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await leagueMgmt.updateTeam(teamId, {
        name: form.name.trim(),
        shortName: form.shortName.trim() || null
      });
      setSavedAt(new Date());
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Team name"
        htmlFor="name"
        hint="Shown in standings, schedules, and the public funnel."
      >
        <Input
          id="name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field
        label="Short name"
        htmlFor="shortName"
        hint="2–6 characters. Used on jerseys and tight UI surfaces."
      >
        <Input
          id="shortName"
          maxLength={6}
          value={form.shortName}
          onChange={(e) => setForm({ ...form, shortName: e.target.value })}
          placeholder="e.g. BIGK"
        />
      </Field>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
              Save changes
            </>
          )}
        </Button>
        {savedAt ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Saved {savedAt.toLocaleTimeString()}
          </span>
        ) : null}
      </div>
    </form>
  );
}
