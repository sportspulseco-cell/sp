import { SYSTEM_ROLE_BY_CODE } from "@sportspulse/kernel";
import type { RoleAssignment } from "@/lib/api/types";

/**
 * Resolve a user's "primary type" — what we show in the Type column,
 * what the Edit-profile dialog targets, what the Type dropdown
 * pre-selects. Single source of truth so all three places stay in
 * sync. (See CLAUDE.md "Design thinking before code".)
 *
 * Order:
 *   1. super_admin if isSuperAdmin (it's a flag, not an assignment)
 *   2. lowest-rank-number active role (super_admin=0, spectator=12)
 *   3. null when neither
 */
/**
 * Every role a user holds, primary first (same order as
 * resolvePrimaryRole), each once. A player who is also a captain has a
 * profile for each, and Edit profile must show both, not only the
 * higher-ranked captain one (PPHL item 6).
 */
export function resolveProfileRoles(
  isSuperAdmin: boolean,
  assignments: RoleAssignment[]
): Array<{ code: string; name: string }> {
  const out: Array<{ code: string; name: string }> = [];
  const seen = new Set<string>();
  const push = (code: string, name: string) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({ code, name });
  };
  if (isSuperAdmin) push("super_admin", SYSTEM_ROLE_BY_CODE["super_admin"]?.name ?? "Super admin");
  const active = assignments
    .filter((r) => !r.revokedAt && r.role?.code)
    .sort(
      (a, b) =>
        (SYSTEM_ROLE_BY_CODE[a.role?.code ?? ""]?.rank ?? 999) -
        (SYSTEM_ROLE_BY_CODE[b.role?.code ?? ""]?.rank ?? 999)
    );
  for (const a of active) {
    const code = a.role!.code;
    push(code, a.role?.name ?? SYSTEM_ROLE_BY_CODE[code]?.name ?? "Custom");
  }
  return out;
}

export function resolvePrimaryRole(
  isSuperAdmin: boolean,
  assignments: RoleAssignment[]
): { code: string; name: string } | null {
  if (isSuperAdmin) {
    return {
      code: "super_admin",
      name: SYSTEM_ROLE_BY_CODE["super_admin"]?.name ?? "Super admin"
    };
  }
  const active = assignments.filter((r) => !r.revokedAt && r.role?.code);
  if (active.length === 0) return null;
  const ranked = [...active].sort((a, b) => {
    const ra = SYSTEM_ROLE_BY_CODE[a.role?.code ?? ""]?.rank ?? 999;
    const rb = SYSTEM_ROLE_BY_CODE[b.role?.code ?? ""]?.rank ?? 999;
    return ra - rb;
  });
  const top = ranked[0]!;
  return {
    code: top.role?.code ?? "—",
    name:
      top.role?.name ??
      SYSTEM_ROLE_BY_CODE[top.role?.code ?? ""]?.name ??
      "Custom"
  };
}
