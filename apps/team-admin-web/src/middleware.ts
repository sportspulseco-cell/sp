import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@sportspulse/auth/web";

/**
 * Team Admin app middleware.
 *
 * Per the repo owner's directive (2026-05-09) each app has its own
 * sign-in landing — same Supabase project under the hood, but
 * separate cookies + separate gates per app.
 *
 * `requireRole` (in @sportspulse/auth/web):
 *   - refreshes the session cookies
 *   - redirects unauthed users to /sign-in
 *   - reads role_codes from JWT app_metadata (kept in sync by the
 *     IAM handlers — see SupabaseAdminService.setRoleCodes)
 *   - bounces users without one of REQUIRED_ROLE_CODES to
 *     /sign-in?error=wrong_role (super_admin bypasses)
 */
const REQUIRED_ROLE_CODES = ["team_admin", "coach"];

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/auth/callback",
  "/_next",
  "/favicon.ico"
];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  return requireRole({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    request,
    response,
    requiredRoleCodes: REQUIRED_ROLE_CODES,
    publicPaths: PUBLIC_PATHS
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
