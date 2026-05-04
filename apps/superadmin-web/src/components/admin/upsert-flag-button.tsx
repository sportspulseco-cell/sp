"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { admin } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function UpsertFlagButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    key: "",
    description: "",
    isEnabled: false,
    rolloutPct: "0"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const pct = Math.max(0, Math.min(100, parseFloat(form.rolloutPct) || 0));
      await admin.upsertFlag({
        key: form.key,
        description: form.description || null,
        isEnabled: form.isEnabled,
        rolloutPct: pct
      });
      setOpen(false);
      setForm({ key: "", description: "", isEnabled: false, rolloutPct: "0" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        New flag
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New feature flag"
        description="Boolean / variant gate. Re-submitting an existing key updates it."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Key"
            htmlFor="uf-key"
            hint="Stable identifier — lowercase_snake_case."
          >
            <Input
              id="uf-key"
              required
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="ai_highlights"
            />
          </Field>
          <Field label="Description" htmlFor="uf-desc">
            <Input
              id="uf-desc"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What this flag gates"
            />
          </Field>
          <Field
            label="Rollout %"
            htmlFor="uf-rollout"
            hint="0–100. Hashed against actor ID — 50 = enabled for half of orgs."
          >
            <Input
              id="uf-rollout"
              type="number"
              min={0}
              max={100}
              value={form.rolloutPct}
              onChange={(e) =>
                setForm({ ...form, rolloutPct: e.target.value })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(e) =>
                setForm({ ...form, isEnabled: e.target.checked })
              }
            />
            Enabled (master switch)
          </label>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save flag"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
