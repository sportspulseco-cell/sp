"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { crossOrgGrants, iam } from "@/lib/api/browser-api";
import type { Org, Profile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function IssueGrantButton({
  fromOrgId,
  allOrgs
}: {
  fromOrgId: string;
  allOrgs: Org[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [form, setForm] = useState({
    userId: "",
    toOrgId: "",
    permissions: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    iam
      // Server caps limit at 100 — 200 silently 400'd via the catch,
      // leaving "Choose user…" as the only option (BUG-016).
      .listUsers({ limit: 100 })
      .then((p) => {
        setUsers(p.items);
        if (p.items[0]) setForm((f) => ({ ...f, userId: p.items[0]!.id }));
      })
      .catch(() => undefined);
  }, [open]);

  const others = allOrgs.filter((o) => o.id !== fromOrgId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await crossOrgGrants.issue({
        userId: form.userId,
        fromOrgId,
        toOrgId: form.toOrgId,
        permissions: form.permissions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      });
      setOpen(false);
      setForm({ ...form, toOrgId: "", permissions: "" });
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
        <KeyRound className="h-3 w-3" strokeWidth={1.75} />
        Issue grant
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Issue cross-org grant"
        description="Authorize a user to act inside the target org with specific permissions. Common case: a registrar covering multiple clubs in a federation."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="User" htmlFor="ig-user">
            <Select
              id="ig-user"
              required
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">Choose user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ?? u.id.slice(0, 8)}
                  {u.displayName ? ` — ${u.displayName}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target org" htmlFor="ig-target">
            <Select
              id="ig-target"
              required
              value={form.toOrgId}
              onChange={(e) => setForm({ ...form, toOrgId: e.target.value })}
            >
              <option value="">Choose target org…</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Permissions"
            htmlFor="ig-perms"
            hint="Comma-separated. Empty = full delegation."
          >
            <Input
              id="ig-perms"
              value={form.permissions}
              onChange={(e) =>
                setForm({ ...form, permissions: e.target.value })
              }
              placeholder="registration.review, document.sign"
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Issuing…
                </>
              ) : (
                "Issue grant"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
