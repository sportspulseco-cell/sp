import { communications } from "@/lib/api/server-api";
import { PageHeader } from "@sportspulse/ui";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Notification settings — SportsPulse" };

export default async function NotificationSettingsPage() {
  const prefs = await communications.myPreferences().catch(() => null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications · Settings"
        title="Notification settings"
        description="Choose what reaches you by email, in the app, by text and by push. Email and in-app are on until you switch them off; text is off until you turn it on."
      />

      <SettingsClient
        topics={prefs?.topics ?? []}
        channels={prefs?.channels ?? ["email", "in_app"]}
        channelDefaults={prefs?.channelDefaults ?? { email: true, in_app: true, sms: false, push: true }}
        channelStatus={prefs?.channelStatus ?? null}
        sms={prefs?.sms ?? { phoneMasked: null, hasPhone: false }}
        initialItems={prefs?.items ?? []}
      />
    </div>
  );
}
