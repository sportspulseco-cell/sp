"use client";

import { useRouter } from "next/navigation";
import { SignUpFunnel, type SignUpFunnelApi } from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import { createClient } from "@/lib/supabase/client";

/**
 * Player sign-up. Multi-step funnel: welcome → account →
 * identity → done. Account creation hands off to /onboarding which
 * captures role-profile fields via the existing OnboardingFunnel.
 */
export function SignUpClient({ next = null }: { next?: string | null }) {
  // Carried through onboarding so a player who signed up from a team
  // link lands back on it ("Join <team>"), not on the home page, where
  // the link was lost (PPHL, 30 Oct 2026).
  const after = next ? `?next=${encodeURIComponent(next)}` : "";
  const router = useRouter();

  const api: SignUpFunnelApi = {
    async signUp({ email, password, displayName }) {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } }
      });
      if (error) throw new Error(error.message);
    },
    async updateProfile(input) {
      // patchMe authenticates with the freshly-created Supabase
      // session (set by signUp above). Field whitelist mirrors the
      // API DTO.
      await iam.patchMe(input);
    }
  };

  return (
    <SignUpFunnel
      appName="Player"
      emailLabel="Email"
      roleLabel="Player / Free agent"
      signInHref={`/sign-in${after}`}
      onboardingHref={`/onboarding${after}`}
      api={api}
      onComplete={() => router.push(`/onboarding${after}`)}
    />
  );
}
