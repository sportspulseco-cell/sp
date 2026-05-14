import { communications } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Notification settings — SportsPulse" };

export default async function NotificationSettingsPage() {
  const prefs = await communications
    .myPreferences()
    .catch(() => ({ items: [], templates: [] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Notifications · Settings"
        title="Email preferences"
        description="Turn off the emails and in-app cards you don't want. Anything you don't explicitly toggle off stays on by default. SMS lands in a future release."
      />

      <SettingsClient
        initialTemplates={prefs.templates}
        initialItems={prefs.items}
      />
    </div>
  );
}
