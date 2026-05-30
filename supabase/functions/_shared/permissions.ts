import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Edge-Function-side permission gate.
 *
 * ====================================================================
 *  CANONICAL CATALOGUE: packages/kernel/src/permissions.ts
 *  This file ONLY implements the runtime check. Permission strings,
 *  role catalogue, and wildcard semantics live in the canonical file.
 *  Keep `hasPermission`'s wildcard rules in lockstep with
 *  `expandPermissions` in the kernel.
 * ====================================================================
 *
 * Scope hierarchy (matches NestJS RolesGuard):
 *   platform > org > league > season > division > team > game
 * A platform-scoped role assignment satisfies any narrower scope. An
 * org-scoped assignment satisfies any league/season/division within
 * that org. And so on.
 */

export interface ScopeContext {
  orgId?: string | null;
  leagueId?: string | null;
  seasonId?: string | null;
  divisionId?: string | null;
  teamId?: string | null;
}

/** Match the kernel's `expandPermissions` semantics without materialising the full list. */
function hasPermission(rolePerms: unknown, required: string): boolean {
  if (!Array.isArray(rolePerms)) return false;
  if (rolePerms.includes("*")) return true;
  if (rolePerms.includes(required)) return true;
  const moduleName = required.split(".")[0];
  if (rolePerms.includes(`${moduleName}.*`)) return true;
  return false;
}

function matchesScope(
  rowScopeType: string,
  rowScopeId: string | null,
  ctx: ScopeContext,
): boolean {
  // Platform-scope covers everything.
  if (rowScopeType === "platform") return true;
  if (rowScopeId === null) return false;
  switch (rowScopeType) {
    case "org": return ctx.orgId === rowScopeId;
    case "league": return ctx.leagueId === rowScopeId;
    case "season": return ctx.seasonId === rowScopeId;
    case "division": return ctx.divisionId === rowScopeId;
    case "team": return ctx.teamId === rowScopeId;
    default: return false;
  }
}

/**
 * Resolve the full scope chain for a season — caller passes a season id,
 * we return { orgId, leagueId, seasonId, divisionId? } that the gate
 * checks against. Single round-trip.
 */
export async function resolveSeasonScope(
  sb: SupabaseClient,
  seasonId: string,
  divisionId?: string,
): Promise<ScopeContext | null> {
  const { data, error } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", seasonId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    orgId: data.org_id as string,
    leagueId: data.league_id as string,
    seasonId: data.id as string,
    divisionId: divisionId ?? null,
  };
}

/**
 * Returns true iff any of the user's active role assignments grants the
 * required permission AND covers the supplied scope.
 */
export async function userHasPermission(
  sb: SupabaseClient,
  userId: string,
  required: string,
  scope: ScopeContext = {},
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("user_role_assignments")
    .select("scope_type, scope_id, effective_to, roles!inner(code, permissions)")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error || !data) return false;

  for (const row of data) {
    if (row.effective_to && row.effective_to < nowIso) continue;
    // deno-lint-ignore no-explicit-any
    const role = (row as any).roles;
    if (!role) continue;
    if (!hasPermission(role.permissions, required)) continue;
    if (matchesScope(row.scope_type as string, row.scope_id as string | null, scope)) {
      return true;
    }
  }
  return false;
}

export function forbidden(message = "forbidden"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
