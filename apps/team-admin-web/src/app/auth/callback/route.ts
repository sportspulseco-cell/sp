import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase email-verification + magic-link redirect target.
// Each role-targeted app gets its own callback so verification
// links open in the right app. When email_confirm is required
// (SUPABASE_REQUIRE_EMAIL_CONFIRM=true on the API), the
// confirmation link in the user's inbox lands here and exchanges
// the code for an active session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
