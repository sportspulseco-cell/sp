import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Profile — SportsPulse" };

export default async function Page() {
  const profile = await iam.me().catch(() => null);

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
        description="Edit how your name + locale appear across the league. Identity fields used for compliance live on your person record."
      />
      <ProfileForm profile={profile} />
    </div>
  );
}
