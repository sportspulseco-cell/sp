import "server-only";
import { grantableRoleCodes, type RoleHolding, type ScopeType } from "@sportspulse/kernel";
import { iam } from "@/lib/api/server-api";

export interface ViewerHolding extends RoleHolding {
  scopeId: string | null;
  scopeName: string | null;
}

export interface ViewerRoleGrants {
  isSuperAdmin: boolean;
  holdings: ViewerHolding[];
  /** Candidates this viewer may grant at a scope of `scopeType` (kernel rule). */
  grantable: (scopeType: ScopeType, candidates: readonly string[]) => string[];
}

/**
 * The signed-in admin's role holdings, for role pickers (FR-3.19.2).
 * Org and league admins see only the roles they may grant; the API
 * enforces the same kernel rule plus the scope on every write.
 */
export async function viewerRoleGrants(): Promise<ViewerRoleGrants> {
  const [scope, roles] = await Promise.all([
    iam.meScope().catch(() => null),
    iam.myActiveRoles().catch(() => [])
  ]);
  const isSuperAdmin = !!scope?.isSuperAdmin;
  const holdings: ViewerHolding[] = roles
    .filter((r) => r.role?.code)
    .map((r) => ({
      roleCode: r.role!.code,
      scopeType: r.scopeType,
      scopeId: r.scopeId ?? null,
      scopeName: (r as { scopeName?: string | null }).scopeName ?? null
    }));
  return {
    isSuperAdmin,
    holdings,
    grantable: (scopeType, candidates) =>
      grantableRoleCodes(holdings, scopeType, candidates, isSuperAdmin)
  };
}
