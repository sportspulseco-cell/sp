import { Users } from "lucide-react";
import { iam } from "@/lib/api/server-api";
import type { ScopeType } from "@sportspulse/kernel";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { RoleAssignmentPanel } from "@/components/roles/role-assignment-panel";

/**
 * Server component wrapper for the role-assignment panel — fetches the
 * current scoped assignments and hands them to the client component.
 *
 * Drops into every hierarchical detail page. Keeps each resource page
 * thin: one import, one element. The panel itself is the single source
 * of truth for the assign/invite/revoke flow.
 */
export async function ResourceAdminsSection({
  scopeType,
  scopeId,
  resourceLabel,
  allowedRoleCodes,
  description
}: {
  scopeType: ScopeType;
  scopeId: string;
  resourceLabel: string;
  allowedRoleCodes: string[];
  description?: string;
}) {
  const assignments = await iam
    .listRoleAssignments({ scopeType, scopeId, activeOnly: true })
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <IconTile icon={Users} tint="emerald" size="sm" />
        <div className="flex-1">
          <Eyebrow>Admins</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
            Manage admins for this {scopeType}
          </p>
          {description && (
            <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
          )}
        </div>
      </header>
      <div className="px-6 py-5">
        <RoleAssignmentPanel
          scopeType={scopeType}
          scopeId={scopeId}
          allowedRoleCodes={allowedRoleCodes}
          resourceLabel={resourceLabel}
          initialAssignments={assignments.items}
        />
      </div>
    </section>
  );
}
