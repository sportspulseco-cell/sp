import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";

/**
 * GET /switch-org?org=<id>&next=<path>: make `org` the active org, then
 * open `next`. Used by `openInActiveOrg` when a record page belongs to
 * another org the caller manages. Same cookie as the org switcher; the
 * read path (`getActiveOrgId`) ignores an org outside the caller's
 * scope, so this grants nothing. `next` must be a path on this app.
 */
export function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") ?? "";
  const raw = req.nextUrl.searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  if (/^[0-9a-f-]{36}$/i.test(org)) {
    res.cookies.set(ACTIVE_ORG_COOKIE, org, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    });
  }
  return res;
}
