"use client";

import { useRouter } from "next/navigation";
import {
  OnboardingFunnel,
  type OnboardingApi
} from "@sportspulse/registration-funnel";
import {
  ROLE_PROFILE_SCHEMAS,
  type FormDefinition
} from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";

/**
 * Bind the OnboardingFunnel to the shared @sportspulse/api-client SDK
 * + the in-app router. Stays a thin wrapper so the funnel package
 * itself remains framework-neutral.
 */
export function OnboardingClient({
  userId,
  userType
}: {
  userId: string;
  userType: string;
}) {
  const router = useRouter();

  const api: OnboardingApi = {
    async loadOnboarding(uid, code) {
      const [profile, form] = await Promise.all([
        iam.getRoleProfile(uid, code),
        iam.getRoleProfileForm(code).catch(() => ({
          source: "kernel-default" as const,
          schema: null,
          formVersionId: null
        }))
      ]);
      const adminSchema =
        form.source === "admin" && form.schema
          ? (form.schema as unknown as FormDefinition)
          : null;
      return {
        answers: profile.data ?? {},
        schema:
          adminSchema ??
          ROLE_PROFILE_SCHEMAS[code] ?? {
            schemaVersion: 1 as const,
            questions: []
          },
        schemaSource: adminSchema ? "admin" : "kernel-default"
      };
    },
    async completeOnboarding(uid, code, data) {
      await iam.setRoleProfile(uid, {
        roleCode: code,
        data,
        complete: true
      });
    }
  };

  return (
    <OnboardingFunnel
      userId={userId}
      userType={userType}
      api={api}
      onComplete={() => router.replace("/")}
    />
  );
}
