"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function CreatePersonButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New person
      </Button>
      <CreatePersonDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CreatePersonDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    legalFirstName: "",
    legalLastName: "",
    preferredName: "",
    dobDate: "",
    countryCode: "US"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await iam.createPerson({
        legalFirstName: form.legalFirstName,
        legalLastName: form.legalLastName,
        preferredName: form.preferredName || null,
        dobDate: form.dobDate || null,
        countryCode: form.countryCode || null
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create person"
      description="A subject identity. Used for registration, roster moves, consents."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Legal first name" htmlFor="legalFirstName">
            <Input
              id="legalFirstName"
              required
              value={form.legalFirstName}
              onChange={(e) => set("legalFirstName", e.target.value)}
            />
          </Field>
          <Field label="Legal last name" htmlFor="legalLastName">
            <Input
              id="legalLastName"
              required
              value={form.legalLastName}
              onChange={(e) => set("legalLastName", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Preferred name"
          htmlFor="preferredName"
          hint="Optional — what they go by"
        >
          <Input
            id="preferredName"
            value={form.preferredName}
            onChange={(e) => set("preferredName", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date of birth" htmlFor="dobDate">
            <Input
              id="dobDate"
              type="date"
              value={form.dobDate}
              onChange={(e) => set("dobDate", e.target.value)}
            />
          </Field>
          <Field label="Country" htmlFor="countryCode" hint="ISO-3166 alpha-2">
            <Input
              id="countryCode"
              maxLength={2}
              value={form.countryCode}
              onChange={(e) =>
                set("countryCode", e.target.value.toUpperCase())
              }
            />
          </Field>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create person"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
