import { load } from "@sportspulse/api-client";
import { LoadError, PageHeader } from "@sportspulse/ui";
import { communications, loadMeScope } from "@/lib/api/server-api";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications · Team Admin" };
export default async function NotificationsPage() {
  const scope = await loadMeScope();
  const result = scope?.personId ? await load(communications.myNotifications({ limit: 50 })) : null;
  return <div className="min-w-0 space-y-6">
    <PageHeader eyebrow="Your team" title="Notifications" description="Your schedule changes, results and team updates." />
    {!result ? <p className="text-sm text-fg-muted">A linked player profile is needed to receive notifications. Ask your league administrator for help.</p> :
      result.ok ? <Inbox initial={result.data} /> : <LoadError what="your notifications" status={result.status} message={result.message} />}
  </div>;
}
