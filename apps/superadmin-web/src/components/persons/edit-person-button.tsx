"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import type { Person } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function EditPersonButton({ person }: { person: Person }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    legalFirstName: person.legalFirstName,
    legalLastName: person.legalLastName,
    preferredName: person.preferredName ?? "",
    dobDate: person.dobDate ?? "",
    countryCode: person.countryCode ?? ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await iam.updatePerson(person.id, {
        legalFirstName: form.legalFirstName,
        legalLastName: form.legalLastName,
        preferredName: form.preferredName || null,
        dobDate: form.dobDate || null,
        countryCode: form.countryCode || null
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
        Edit
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit person"
        description="Personal details. Auth link is managed separately."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal first name" htmlFor="ep-fn">
              <Input
                id="ep-fn"
                required
                value={form.legalFirstName}
                onChange={(e) =>
                  setForm({ ...form, legalFirstName: e.target.value })
                }
              />
            </Field>
            <Field label="Legal last name" htmlFor="ep-ln">
              <Input
                id="ep-ln"
                required
                value={form.legalLastName}
                onChange={(e) =>
                  setForm({ ...form, legalLastName: e.target.value })
                }
              />
            </Field>
          </div>
          <Field
            label="Preferred name"
            htmlFor="ep-pn"
            hint="What this person goes by — shown across the platform when set."
          >
            <Input
              id="ep-pn"
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
              placeholder="Optional"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth" htmlFor="ep-dob">
              <Input
                id="ep-dob"
                type="date"
                value={form.dobDate}
                onChange={(e) => setForm({ ...form, dobDate: e.target.value })}
              />
            </Field>
            <Field label="Country" htmlFor="ep-country">
              <Input
                id="ep-country"
                value={form.countryCode}
                onChange={(e) =>
                  setForm({ ...form, countryCode: e.target.value.toUpperCase() })
                }
                placeholder="US / CA / GB"
                maxLength={2}
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
