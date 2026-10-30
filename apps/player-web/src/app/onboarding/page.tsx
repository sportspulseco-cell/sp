import { OnboardingClient } from "./onboarding-client";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@sportspulse/kernel";

/**
 * Post-signin onboarding wizard. Every app (player / org-admin /
 * team-admin) mounts this so first-time sign-ins walk through their
 * role-profile fields before landing on the home page.
 *
 * Role code is resolved from app_metadata.role_codes (mirrored by
 * the IAM handlers).
 */
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const codes = (user.app_metadata?.role_codes ?? []) as string[];
  const userType = codes[0] ?? "player";
  return <OnboardingClient userId={user.id} userType={userType} next={safeNextPath(next ?? null, "/")} />;
}
