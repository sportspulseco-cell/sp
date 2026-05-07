"use client";

import { useRouter } from "next/navigation";
import {
  SignUpFunnel,
  type SignUpFunnelApi
} from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import { createClient } from "@/lib/supabase/client";

/**
 * Super Admin sign-up. Multi-step funnel (welcome → account → identity
 * → done) shared with the role-targeted apps. Super-admin status is
 * not granted at signup — an existing super_admin promotes you after.
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
      appName="Super Admin"
      roleLabel="platform admins"
      signInHref="/sign-in"
      onboardingHref="/dashboard"
      api={api}
      onComplete={() => router.push("/dashboard")}
    />
  );
}
