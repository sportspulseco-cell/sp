import { ShieldAlert } from "lucide-react";
import { EmptyState, PageHeader, LoadError } from "@sportspulse/ui";
import { load } from "@sportspulse/api-client";
import { iam } from "@/lib/api/server-api";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { RoleProfileSection } from "./role-profile-section";

// Which role's profile a player edits here: player first, then free
// agent; never just the first code in the list (that picked wrong forms).
function playerProfileRole(codes: string[]): string {
  if (codes.includes("player")) return "player";
  if (codes.includes("free_agent")) return "free_agent";
  return "player";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Profile · Player" };

export default async function Page() {
  const profileResult = await load(iam.me());
  const profile = profileResult.ok ? profileResult.data : null;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const roleCode = playerProfileRole((user?.app_metadata?.role_codes ?? []) as string[]);

  if (!profileResult.ok || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="PROFILE" title="Profile" />
        <LoadError
          what="your profile"
          status={profileResult.ok ? null : profileResult.status}
          message={profileResult.ok ? undefined : profileResult.message}
        />
      </div>
    );
  }

  // The photo the player added at sign-up (role profile "Photo / avatar"),
  // shown when it is a link the browser can load (PPHL, 29 Oct 2026).
  const roleProfile = await iam.getRoleProfile(profile.id, roleCode).catch(() => null);
  const photo = typeof roleProfile?.data?.photoUrl === "string" && /^https?:\/\//.test(roleProfile.data.photoUrl) ? roleProfile.data.photoUrl : null;
  const name = profile.preferredName || [profile.legalFirstName, profile.legalLastName].filter(Boolean).join(" ") || profile.email || "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-full border border-border object-cover" />
            ) : (
              <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[18px] font-semibold text-fg-muted">
                {initials}
              </span>
            )}
            <span className="min-w-0">
              <span className="block">{name || "Profile"}</span>
              <span className="block text-[14px] font-normal text-fg-muted">Your profile</span>
            </span>
          </span>
        }
        description="Your name, locale and the player details your league uses for eligibility, emergencies and rosters."
      />
      <ProfileForm profile={profile} />
      <RoleProfileSection userId={profile.id} roleCode={roleCode} />
    </div>
  );
}
