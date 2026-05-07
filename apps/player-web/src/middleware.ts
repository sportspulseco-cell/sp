import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@sportspulse/auth/web";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth/callback", "/_next", "/favicon.ico"];

const REQUIRED_ROLE_CODES = ["player", "free_agent"];

/**
 * Player app middleware.
 *
 * Per the repo owner's directive (2026-05-09) each app has its own
 * sign-in landing — same Supabase project under the hood, but
 * separate cookies + separate gates. Users without one of the roles
 * in REQUIRED_ROLE_CODES are bounced to /sign-in?error=wrong_role.
 *
 * The actual role check on the server side reads from
 * `user_role_assignments`; the middleware here uses a JWT app_metadata
 * claim if the auth user has it set. (Belt-and-braces — the API
 * still re-checks via AuthorizedAccessGuard.)
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const { user } = await refreshSupabaseSession({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    request,
    response
  });

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
