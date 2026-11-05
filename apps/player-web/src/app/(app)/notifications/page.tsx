import Link from 'next/link';
import { Settings } from 'lucide-react';
import { load } from '@sportspulse/api-client';
import { LoadError, PageHeader } from '@sportspulse/ui';
import { communications, loadMeScope } from '@/lib/api/server-api';
import { Inbox } from './inbox';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Notifications · Player' };
export default async function NotificationsPage() {
  const scope = await loadMeScope();
  const result = scope?.personId ? await load(communications.myNotifications({ limit: 50 })) : null;
  return <div className="min-w-0 space-y-6">
    <PageHeader eyebrow="Notifications" title="Notifications" description="Your schedule changes, results and team updates." action={
      <Link href="/notifications/settings" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-fg-muted"><Settings className="h-4 w-4" />Settings</Link>
    } />
    {!result ? <p className="text-sm text-fg-muted">A linked player profile is needed to receive notifications. Ask your league administrator for help.</p> :
      result.ok ? <Inbox initial={result.data} /> : <LoadError what="your notifications" status={result.status} message={result.message} />}
  </div>;
}
