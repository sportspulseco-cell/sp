import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@sportspulse/auth/web";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/auth/callback",
  "/_next",
  "/favicon.ico",
  "/api/health"
];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const { user } = await refreshSupabaseSession({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    request,
    response
  });

  const isPublic = PUBLIC_PATHS.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );
  if (!user && !isPublic) {
    const hadAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    if (hadAuthCookie) url.searchParams.set("error", "session_expired");
    return NextResponse.redirect(url);
  }
  if (user && request.nextUrl.pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
