"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { iam, orgs as orgsApi } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateRoleButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [form, setForm] = useState({
    orgId: "",
    code: "",
    name: "",
    description: "",
    permissions: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    orgsApi
      .list({ limit: 100 })
      .then((p) => {
        setOrgs(p.items);
        if (p.items[0]) setForm((f) => ({ ...f, orgId: p.items[0]!.id }));
      })
      .catch(() => undefined);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await iam.createRole({
        orgId: form.orgId || null,
        code: form.code,
        name: form.name,
        description: form.description || null,
        permissions: form.permissions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      });
      setOpen(false);
      setForm({
        orgId: form.orgId,
        code: "",
        name: "",
        description: "",
        permissions: ""
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New role
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New custom role"
        description="Custom roles attach to a single org and live alongside the system catalog. System roles are seed-managed and can't be created from the UI."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Organization"
            htmlFor="orgId"
            hint="Required for custom roles. Leave empty for platform-scoped (system) roles, which can't be created via API."
          >
            <Select
              id="orgId"
              required
              value={form.orgId}
              onChange={(e) => setForm({ ...form, orgId: e.target.value })}
            >
              <option value="">Choose org…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Code"
            htmlFor="code"
            hint="Stable identifier — lowercase_snake_case. Used in @Roles() decorators."
          >
            <Input
              id="code"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="tournament_director"
            />
          </Field>
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tournament Director"
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Optional"
            />
          </Field>
          <Field
            label="Permissions"
            htmlFor="permissions"
            hint="Comma-separated. Use wildcards (game.*) or specific codes (game_event.write)."
          >
            <Input
              id="permissions"
              value={form.permissions}
              onChange={(e) =>
                setForm({ ...form, permissions: e.target.value })
              }
              placeholder="game.*, suspension.issue, registration.review"
            />
          </Field>

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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                "Create role"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
