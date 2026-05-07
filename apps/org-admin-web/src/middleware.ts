import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@sportspulse/auth/web";

const REQUIRED_ROLE_CODES = ["org_admin"];

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/auth/callback",
  "/_next",
  "/favicon.ico",
  // Onboarding wizard — listed here so requireRole's public-path skip
  // lets the page render without bouncing the user back to itself.
  "/onboarding"
];

/**
 * Org Admin app middleware.
 *
 * Per repo owner directive 2026-05-09 each role-targeted app has its
 * own sign-in landing AND its own onboarding wizard for first-time
 * sign-ins. requireRole reads role_codes + profile_complete from
 * Supabase JWT app_metadata; super_admin bypasses both checks.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  return requireRole({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    request,
    response,
    requiredRoleCodes: REQUIRED_ROLE_CODES,
    publicPaths: PUBLIC_PATHS,
    onboardingPath: "/onboarding"
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
