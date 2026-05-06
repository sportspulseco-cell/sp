"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import type { Role } from "@/lib/api/types";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AssignRolePanel } from "@/components/roles/assign-role-panel";
import { resolvePrimaryRole } from "./primary-role";

/**
 * Click-to-edit "user type" cell on /users.
 *
 * The user thinks "type === role". Concretely we surface:
 *   - "Super admin" if profiles.isSuperAdmin
 *   - else the highest-rank role from active assignments
 *   - else "—"
 *
 * Clicking opens a dialog that wraps the canonical <AssignRolePanel> —
 * same role + scope picker that /users/[id] uses. Granting a new role
 * here adds an assignment (does not auto-revoke prior ones; that's a
 * deliberate choice — user can hold multiple roles).
 */
export function UserTypeCell({
  userId,
  isSuperAdmin
}: {
  userId: string;
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [loadingDialog, setLoadingDialog] = useState(false);

  // Eager load primary role on mount so the cell shows it without
  // waiting for the dialog. One round-trip per row — small enough.
  const [primary, setPrimary] = useState<{ code: string; name: string } | null>(
    null
  );
  const [loadingPrimary, setLoadingPrimary] = useState(true);

  useEffect(() => {
    let cancelled = false;
    iam
      .activeRolesForUser(userId)
      .then((rows) => {
        if (cancelled) return;
        setPrimary(resolvePrimaryRole(isSuperAdmin, rows));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingPrimary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isSuperAdmin]);

  useEffect(() => {
    if (!open || roles !== null) return;
    setLoadingDialog(true);
    iam
      .listRoles({ limit: 200 })
      .then((ro) => setRoles(ro.items))
      .catch(() => undefined)
      .finally(() => setLoadingDialog(false));
  }, [open, roles, userId]);

  const label = isSuperAdmin
    ? "Super admin"
    : primary
    ? primary.name
    : loadingPrimary
    ? "…"
    : "—";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 transition-colors hover:border-border hover:bg-surface-2"
        title="Change user type"
      >
        {isSuperAdmin ? (
          <Badge tone="primary" mono>
            SUPER ADMIN
          </Badge>
        ) : primary ? (
          <span className="font-mono text-[11px] uppercase tracking-widest text-fg">
            {primary.code}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
        <Pencil
          className="h-3 w-3 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={1.75}
        />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Change user type"
        description={`User type === role. Pick a role and (if scoped) the resource it applies to. Adds a new assignment without revoking existing ones — manage the full list from the user's detail page or the Roles cell.`}
        size="lg"
      >
        {loadingDialog && (
          <div className="flex items-center gap-2 py-6 text-[13px] text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {!loadingDialog && roles !== null && (
          <AssignRolePanel
            userId={userId}
            roles={roles}
            // Pre-select the user's CURRENT primary role so the dropdown
            // matches what the Type column shows.
            defaultRoleCode={primary?.code}
          />
        )}
      </Dialog>
    </>
  );
}

