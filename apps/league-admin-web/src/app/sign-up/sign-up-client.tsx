"use client";

import { useRouter } from "next/navigation";
import {
  SignUpFunnel,
  type SignUpFunnelApi
} from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import { createClient } from "@/lib/supabase/client";

/**
 * League Admin sign-up. Same multi-step funnel as the other apps.
 * A super_admin assigns the league_admin role + scope after signup.
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
      await iam.patchMe(input);
    }
  };

  return (
    <SignUpFunnel
      appName="League Admin"
      roleLabel="League Admin"
      signInHref="/sign-in"
      onboardingHref="/"
      api={api}
      onComplete={() => router.push("/")}
    />
  );
}
