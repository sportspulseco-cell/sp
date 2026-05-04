"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import type { Profile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function EditUserButton({ user }: { user: Profile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    displayName: user.displayName ?? "",
    preferredName: user.preferredName ?? "",
    locale: user.locale ?? "en-US",
    timezone: user.timezone ?? "UTC"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await iam.updateUser(user.id, {
        displayName: form.displayName || null,
        preferredName: form.preferredName || null,
        locale: form.locale,
        timezone: form.timezone
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg"
      >
        <Pencil className="h-3 w-3" strokeWidth={1.75} />
        Edit profile
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit user profile"
        description="Display details + locale preferences. Email + auth identity are managed by Supabase Auth."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Display name" htmlFor="eu-display">
            <Input
              id="eu-display"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              placeholder="What you show across the platform"
            />
          </Field>
          <Field label="Preferred name" htmlFor="eu-preferred">
            <Input
              id="eu-preferred"
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
              placeholder="Goes-by name"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Locale" htmlFor="eu-locale">
              <Input
                id="eu-locale"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                placeholder="en-US"
              />
            </Field>
            <Field label="Timezone" htmlFor="eu-tz">
              <Input
                id="eu-tz"
                value={form.timezone}
                onChange={(e) =>
                  setForm({ ...form, timezone: e.target.value })
                }
                placeholder="America/New_York"
              />
            </Field>
          </div>

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
                "Save changes"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
