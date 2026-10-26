import { load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="PROFILE"
        title="Profile"
        description="Your name, locale and the player details your league uses for eligibility, emergencies and rosters."
      />
      <ProfileForm profile={profile} />
      <RoleProfileSection userId={profile.id} roleCode={roleCode} />
    </div>
  );
}
