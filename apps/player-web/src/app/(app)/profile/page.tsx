import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
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
export const metadata = { title: "Profile — SportsPulse" };

export default async function Page() {
  const profile = await iam.me().catch(() => null);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const roleCode = playerProfileRole((user?.app_metadata?.role_codes ?? []) as string[]);

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// PROFILE" title="Profile" />
        <EmptyState
          icon={ShieldAlert}
          title="Sign in expired"
          description="Couldn't load your profile. Sign in again to continue."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// PROFILE"
        title="Profile"
        description="Your name, locale and the player details your league uses for eligibility, emergencies and rosters."
      />
      <ProfileForm profile={profile} />
      <RoleProfileSection userId={profile.id} roleCode={roleCode} />
    </div>
  );
}
