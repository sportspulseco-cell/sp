"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldPlus, Users } from "lucide-react";
import type { ScopeType } from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";
import type { RoleAssignment } from "@/lib/api/types";
import { Dialog } from "@/components/ui/dialog";
import { RoleAssignmentPanel } from "@/components/roles/role-assignment-panel";

/**
 * In-row "Assign admin" cell for hierarchical list pages
 * (/seasons, /leagues, /divisions, /teams).
 *
 * Renders a button showing the current count of active assignments at
 * this scope; clicking opens a modal that wraps the canonical
 * <RoleAssignmentPanel>. Same panel that the per-resource detail pages
 * use — single source of truth, role-coded per scope. List rows lazy-
 * fetch assignments only when the dialog opens, so we don't fan out
 * N+1 calls on page load.
 */
export function AssignAdminCell({
  scopeType,
  scopeId,
  resourceLabel,
  allowedRoleCodes
}: {
  scopeType: ScopeType;
  scopeId: string;
  resourceLabel: string;
  allowedRoleCodes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || assignments !== null || loading) return;
    setLoading(true);
    setError(null);
    iam
      .listRoleAssignments({
        scopeType: scopeType as Exclude<ScopeType, "platform">,
        scopeId,
        activeOnly: true,
        limit: 50
      })
      .then((p) => setAssignments(p.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, assignments, loading, scopeType, scopeId]);

  const count = assignments?.length ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
        title={`Manage admins for ${resourceLabel}`}
      >
        {count === null ? (
          <ShieldPlus className="h-3 w-3" strokeWidth={2} />
        ) : count > 0 ? (
          <Users className="h-3 w-3" strokeWidth={2} />
        ) : (
          <ShieldPlus className="h-3 w-3" strokeWidth={2} />
        )}
        <span>
          {count === null
            ? "Assign"
            : count === 0
            ? "Assign"
            : `${count} admin${count === 1 ? "" : "s"}`}
        </span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Admins · ${resourceLabel}`}
        description={`Grant or revoke ${scopeType}-scoped roles. Existing users get the role immediately; emailed invites send a magic-link and grant on first sign-in.`}
        size="lg"
      >
        {loading && (
          <div className="flex items-center gap-2 px-1 py-6 text-[13px] text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading current assignments…
          </div>
        )}
        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {!loading && !error && assignments !== null && (
          <RoleAssignmentPanel
            scopeType={scopeType}
            scopeId={scopeId}
            allowedRoleCodes={allowedRoleCodes}
            resourceLabel={resourceLabel}
            initialAssignments={assignments}
          />
        )}
      </Dialog>
    </>
  );
}
