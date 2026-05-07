import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "./middleware";

/**
 * Reads the active role codes for an authenticated user out of
 * Supabase JWT `app_metadata.role_codes`. Mirror is kept in sync by
 * the IAM handlers (assign / revoke / inviteUser) — see
 * `mirrorRolesToAuthMetadata` on superadmin-api.
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
 * Middleware helper: gate a request behind a role allowlist.
 *
 * Returns:
 *   - a redirect NextResponse when the user should be bounced (no
 *     session, or session lacks any of `requiredRoleCodes`)
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
 *     publicPaths: ["/sign-in", "/sign-up", "/auth/callback"]
 *   });
 * }
 * ```
 *
 * super_admin bypasses every requiredRoleCodes check — they can land
 * on any app.
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
}): Promise<NextResponse> {
  const { request, response, requiredRoleCodes, publicPaths } = opts;

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

  // super_admin can land on any app.
  if (isSuperAdmin(user)) return response;

  // Public paths still pass for authed users — they might want to
  // visit /sign-in to switch accounts.
  if (isPublic) return response;

  const codes = new Set(getUserRoleCodes(user));
  const allowed = requiredRoleCodes.some((c) => codes.has(c));
  if (!allowed) {
    // Bounce to sign-in with an error code the page can display. We
    // don't sign the user out — they may have legit access on another
    // app and just landed on the wrong one.
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("error", "wrong_role");
    return NextResponse.redirect(url);
  }

  return response;
}
