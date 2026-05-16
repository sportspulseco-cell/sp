import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@sportspulse/auth/web";

// Spec (doc/test-cases-master.md §F): "Owner: captain (or super_admin
// bypass). Surface: apps/team-admin-web." Captains hold the canonical
// roster / invite / lineup actions — they need access here, alongside
// team_admin and coach. Omitting captain shipped as BUG-022 — Parker
// (captain) bounced with ?error=wrong_role.
const REQUIRED_ROLE_CODES = ["team_admin", "coach", "captain"];

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
 * Team Admin app middleware.
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
