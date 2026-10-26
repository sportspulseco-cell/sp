import { load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import { communications } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Notification settings · Player" };

export default async function NotificationSettingsPage() {
  // A failed load shows an error instead of a form of defaults, so a
  // save can never overwrite settings we could not read.
  const prefs = await load(communications.myPreferences());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications · Settings"
        title="Notification settings"
        description="Choose what reaches you by email and in the app. Everything is on until you switch it off. In-app covers your Notifications inbox."
      />

      {prefs.ok ? (
        <SettingsClient
          topics={prefs.data.topics}
          channels={prefs.data.channels}
          initialItems={prefs.data.items}
        />
      ) : (
        <LoadError what="your notification settings" status={prefs.status} message={prefs.message} />
      )}
    </div>
  );
}
