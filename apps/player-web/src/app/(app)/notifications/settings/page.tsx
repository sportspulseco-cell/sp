import { load } from "@sportspulse/api-client";
import { LoadError, PageHeader } from "@sportspulse/ui";
import { communications } from "@/lib/api/server-api";
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
        description="Choose what reaches you by email, in the app, by text and by push. Email and in-app are on until you switch them off; text is off until you turn it on."
      />

      {prefs.ok ? (
        <SettingsClient
          topics={prefs.data.topics}
          channels={prefs.data.channels}
          channelDefaults={prefs.data.channelDefaults ?? { email: true, in_app: true, sms: false, push: true }}
          channelStatus={prefs.data.channelStatus ?? null}
          sms={prefs.data.sms ?? { phoneMasked: null, hasPhone: false }}
          initialItems={prefs.data.items}
        />
      ) : (
        <LoadError what="your notification settings" status={prefs.status} message={prefs.message} />
      )}
    </div>
  );
}
