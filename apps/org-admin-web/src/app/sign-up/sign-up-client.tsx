"use client";

import { useRouter } from "next/navigation";
import { SignUpFunnel, type SignUpFunnelApi } from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import { createClient } from "@/lib/supabase/client";

/**
 * Org Admin sign-up. Multi-step funnel: welcome → account →
 * identity → done. Account creation hands off to /onboarding which
 * captures role-profile fields via the existing OnboardingFunnel.
 */
export function SignUpClient() {
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
      appName="Org Admin"
      roleLabel="Org Admin"
      signInHref="/sign-in"
      onboardingHref="/onboarding"
      api={api}
      onComplete={() => router.push("/onboarding")}
    />
  );
}
