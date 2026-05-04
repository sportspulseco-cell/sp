"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { registration } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateFormButton({ orgs }: { orgs: Org[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={orgs.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New form
      </Button>
      <CreateFormDialog
        open={open}
        onClose={() => setOpen(false)}
        orgs={orgs}
      />
    </>
  );
}

function CreateFormDialog({
  open,
  onClose,
  orgs
}: {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    orgId: orgs[0]?.id ?? "",
    scope: "org" as "org" | "league" | "division",
    name: "",
    description: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await registration.createForm({
        orgId: form.orgId,
        scope: form.scope,
        name: form.name,
        description: form.description || null
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
      title="New registration form"
      description="Create a form shell. Add a schema version next, then publish to make it active."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Organization" htmlFor="orgId">
          <Select
            id="orgId"
            required
            value={form.orgId}
            onChange={(e) => setForm({ ...form, orgId: e.target.value })}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scope" htmlFor="scope">
          <Select
            id="scope"
            value={form.scope}
            onChange={(e) =>
              setForm({ ...form, scope: e.target.value as typeof form.scope })
            }
          >
            <option value="org">Org-wide</option>
            <option value="league">League-specific</option>
            <option value="division">Division-specific</option>
          </Select>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="2026 Spring Player Registration"
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
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
              "Create form"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
