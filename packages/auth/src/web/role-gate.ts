import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "./middleware";

/**
 * Reads the active role codes for an authenticated user out of
 * Supabase JWT `app_metadata.role_codes`. Mirror is kept in sync by
 * the IAM handlers (assign / revoke / inviteUser) — see
 * SupabaseAdminService.setRoleCodes on superadmin-api.
 *
 * Falls back to [] when the metadata is absent (newly-created users
 * before their first role grant, or pre-backfill rows).
 */
export function getUserRoleCodes(user: {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): string[] {
  const meta = user?.app_metadata ?? {};
  const raw = (meta as Record<string, unknown>)["role_codes"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

/** True for `super_admin` — short-circuits every role check below. */
export function isSuperAdmin(user: {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  return getUserRoleCodes(user).includes("super_admin");
}

/**
 * Has this user finished post-signin onboarding? Flag flips to true
 * when the wizard's Finish step calls `iam.setRoleProfile(..., {
 * complete: true })`.
 *
 * Returns true when missing — backwards-compatible with users created
 * before the onboarding feature shipped (they don't get bounced). The
 * backfill in the same slice explicitly sets it true for existing
 * users so behaviour stays consistent.
 */
export function isProfileComplete(user: {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  const meta = user?.app_metadata ?? {};
  const v = (meta as Record<string, unknown>)["profile_complete"];
  return v === undefined || v === true;
}

/**
 * Middleware helper: gate a request behind a role allowlist + an
 * optional profile-complete check.
 *
 * Returns:
 *   - a redirect NextResponse when the user should be bounced (no
 *     session, missing role, or onboarding incomplete)
 *   - the original `response` when the user is allowed through.
 *
 * Wire into per-app middleware:
 *
 * ```ts
 * export async function middleware(request: NextRequest) {
 *   const response = NextResponse.next({ request });
 *   return requireRole({
 *     request, response,
 *     url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 *     requiredRoleCodes: ["player", "free_agent"],
 *     publicPaths: ["/sign-in", "/sign-up", "/auth/callback"],
 *     onboardingPath: "/onboarding"   // optional
 *   });
 * }
 * ```
 *
 * super_admin bypasses both the role check AND the onboarding check
 * — they're admins, they don't need to onboard the same way.
 */
export async function requireRole(opts: {
  url: string;
  anonKey: string;
  request: NextRequest;
  response: NextResponse;
  /** At least one of these codes must be present on the user. */
  requiredRoleCodes: string[];
  /** Paths that bypass auth entirely (sign-in, callback, etc). */
  publicPaths: string[];
  /**
   * When set, users without `app_metadata.profile_complete` are
   * redirected here. The path itself MUST be in `publicPaths` so the
   * wizard is reachable — we explicitly do NOT enforce that here so
   * the caller can choose (handy if onboarding lives at a path
   * already covered by a broader rule).
   */
  onboardingPath?: string;
}): Promise<NextResponse> {
  const {
    request,
    response,
    requiredRoleCodes,
    publicPaths,
    onboardingPath
  } = opts;

  const isPublic = publicPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  const { user } = await refreshSupabaseSession({
    url: opts.url,
    anonKey: opts.anonKey,
    request,
    response
  });

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // super_admin lands on any app and skips onboarding.
  if (isSuperAdmin(user)) return response;

  // Public paths pass through for authed users too.
  if (isPublic) return response;

  const codes = new Set(getUserRoleCodes(user));
  const allowed = requiredRoleCodes.some((c) => codes.has(c));
  if (!allowed) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("error", "wrong_role");
    return NextResponse.redirect(url);
  }

  // Onboarding gate. Authed + correct role + onboarding required +
  // not already on the onboarding path = redirect.
  if (
    onboardingPath &&
    !isProfileComplete(user) &&
    !request.nextUrl.pathname.startsWith(onboardingPath)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = onboardingPath;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
