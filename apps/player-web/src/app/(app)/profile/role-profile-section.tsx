"use client";

import { RoleProfileEditor } from "@sportspulse/registration-funnel";
import { SYSTEM_ROLE_BY_CODE } from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";

/**
 * The player's own role profile (date of birth, contact, address, USA
 * Hockey ID, emergency contact, positions, level, medical notes): the
 * same fields, labels and rules an admin sees in Invite user → "Set up
 * profile", saved to the same place (profiles.metadata.roleProfile).
 */
export function RoleProfileSection({ userId, roleCode }: { userId: string; roleCode: string }) {
  const roleName = SYSTEM_ROLE_BY_CODE[roleCode]?.name ?? "Player";
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // {roleName} profile
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Used for eligibility, emergencies and your roster card. Fields marked * are required.
        </p>
      </div>
      <RoleProfileEditor
        userId={userId}
        roleCode={roleCode}
        api={{
          getRoleProfile: (id, code) => iam.getRoleProfile(id, code),
          getRoleProfileForm: (code) => iam.getRoleProfileForm(code),
          setRoleProfile: (id, body) => iam.setRoleProfile(id, body),
          uploadImage: (id, body) => iam.uploadAvatar(id, body)
        }}
      />
    </section>
  );
}
