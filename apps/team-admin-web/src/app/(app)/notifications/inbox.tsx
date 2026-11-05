"use client";
import { RecipientInbox } from "@sportspulse/admin-pages";
import type { Notification } from "@sportspulse/api-client";
import { communications } from "@/lib/api/browser-api";
export function Inbox({ initial }: { initial: { items: Notification[]; nextCursor: string | null } }) {
  return <RecipientInbox initial={initial} api={{ list: cursor => communications.myNotifications({ limit: 50, cursor }),
    markRead: communications.markRead, markAllRead: communications.markAllRead }} />;
}
