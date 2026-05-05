"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  countEffectivePermissions,
  type PermissionString
} from "@sportspulse/kernel";
import { iam, orgs as orgsApi } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PermissionTree } from "@/components/permissions/permission-tree";
import { RoleCodePicker } from "@/components/permissions/role-code-picker";

interface Form {
  orgId: string;
  code: string;
  name: string;
  description: string;
  permissions: PermissionString[];
}

const EMPTY: Form = {
  orgId: "",
  code: "",
  name: "",
  description: "",
  permissions: []
};

export function CreateRoleButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
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

  // Code validity drives the submit button — replaces the native browser
  // tooltip ("Please fill out this field") that was confusing users.
  const codeValid =
    /^[a-z][a-z0-9_]{2,40}$/.test(form.code) && !form.code.endsWith("_");
  const nameValid = form.name.trim().length > 0;
  const orgValid = form.orgId.length > 0;
  const canSubmit = codeValid && nameValid && orgValid;

  const effectiveCount = useMemo(
    () => countEffectivePermissions(form.permissions),
    [form.permissions]
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await iam.createRole({
        orgId: form.orgId || null,
        code: form.code,
        name: form.name,
        description: form.description || null,
        permissions: form.permissions
      });
      setOpen(false);
      setForm({ ...EMPTY, orgId: form.orgId });
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
            label="Role code"
            hint="Pick from the curated list or write a custom lowercase_snake_case code. Used by @Roles() decorators on the API."
          >
            <RoleCodePicker
              value={form.code}
              onChange={(code) => setForm((f) => ({ ...f, code }))}
              onSuggestionApply={(s) =>
                setForm((f) => ({
                  ...f,
                  code: s.code,
                  name: f.name || s.name,
                  permissions:
                    f.permissions.length === 0 ? [...s.defaultPermissions] : f.permissions
                }))
              }
            />
            {form.code && !codeValid && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                Code must be lowercase letters / digits / underscores, 3–40
                chars, can't end with `_`.
              </p>
            )}
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
            hint={`Pick the actions this role can perform. ${effectiveCount} effective permission${effectiveCount === 1 ? "" : "s"} selected.`}
          >
            <PermissionTree
              value={form.permissions}
              onChange={(permissions) => setForm((f) => ({ ...f, permissions }))}
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
            <Button type="submit" disabled={loading || !canSubmit}>
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
