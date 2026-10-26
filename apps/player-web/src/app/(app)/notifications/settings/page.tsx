import { communications } from "@/lib/api/server-api";
import { PageHeader } from "@sportspulse/ui";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Notification settings — SportsPulse" };

export default async function NotificationSettingsPage() {
  const prefs = await communications
    .myPreferences()
    .catch(() => ({ items: [], topics: [], channels: ["email", "in_app"] as Array<"email" | "in_app">, templates: [] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications · Settings"
        title="Notification settings"
        description="Choose what reaches you by email and in the app. Everything is on until you switch it off. In-app covers your Notifications inbox."
      />

      <SettingsClient
        topics={prefs.topics}
        channels={prefs.channels}
        initialItems={prefs.items}
      />
    </div>
  );
}
