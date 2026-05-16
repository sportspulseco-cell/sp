"use client";

import { useEffect, useState } from "react";
import { Loader2, Shield, X } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import type { Role, RoleAssignment } from "@/lib/api/types";
import { Dialog } from "@/components/ui/dialog";
import { AssignRolePanel } from "@/components/roles/assign-role-panel";
import { resolvePrimaryRole } from "./primary-role";

/**
 * Per-row role manager for /users.
 *
 * Click "Roles" → modal lists current active assignments (with revoke)
 * and embeds the canonical <AssignRolePanel> to grant a new one. Same
 * code paths as the /users/[id] page — the dialog is just a shortcut.
 */
export function ManageUserRolesCell({
  userId,
  display,
  isSuperAdmin = false
}: {
  userId: string;
  display: string;
  /** Used to default the Assign panel's role dropdown to "super_admin"
   * instead of the alphabetic-first "captain" on a super-admin row. */
  isSuperAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || (assignments !== null && roles !== null)) return;
    setLoading(true);
    setError(null);
    Promise.all([
      iam.activeRolesForUser(userId),
      iam.listRoles({ limit: 200 })
    ])
      .then(([as, ro]) => {
        setAssignments(as);
        setRoles(ro.items);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, assignments, roles, userId]);

  async function onRevoke(id: string) {
    if (!confirm("Revoke this assignment?")) return;
    try {
      await iam.revokeAssignment(id);
      setAssignments((a) => (a ? a.filter((x) => x.id !== id) : a));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const count = assignments?.length ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
        title={`Manage roles for ${display}`}
      >
        <Shield className="h-3 w-3" strokeWidth={2} />
        <span>
          {count === null
            ? "Roles"
            : count === 0
            ? "Add role"
            : `${count} role${count === 1 ? "" : "s"}`}
        </span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Roles · ${display}`}
        description="Grant or revoke scoped roles. Super-admin status is managed separately on the user detail page."
        size="lg"
      >
        {loading && (
          <div className="flex items-center gap-2 py-6 text-[13px] text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {!loading && !error && assignments !== null && roles !== null && (
          <div className="space-y-5">
            {assignments.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-4 text-center text-[13px] text-fg-muted">
                No active assignments yet — use the form below to grant one.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border bg-surface-1">
                {assignments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">
                        {a.role?.name ?? a.roleId.slice(0, 8)}
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                          {a.role?.code}
                        </span>
                      </p>
                      <p className="text-[11px] text-fg-muted">
                        scope: {a.scopeType}
                        {a.scopeId ? ` · ${a.scopeId.slice(0, 8)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRevoke(a.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-rose-500"
                      title="Revoke"
                      aria-label="Revoke"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-md border border-border bg-bg-subtle p-4">
              <AssignRolePanel
                userId={userId}
                roles={roles}
                defaultRoleCode={
                  resolvePrimaryRole(isSuperAdmin, assignments ?? [])?.code
                }
              />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
