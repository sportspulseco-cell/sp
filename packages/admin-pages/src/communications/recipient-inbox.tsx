"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import type { Notification } from "@sportspulse/api-client";
import { Button, EmptyState, LocalDate } from "@sportspulse/ui";

type InboxPage = { items: Notification[]; nextCursor: string | null };
export function RecipientInbox({ initial, api }: { initial: InboxPage; api: {
  list: (cursor: string) => Promise<InboxPage>;
  markRead: (id: string) => Promise<unknown>;
  markAllRead: () => Promise<unknown>;
} }) {
  const [rows, setRows] = useState(initial.items), [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const unread = rows.some(row => !row.readAt);
  async function read(id?: string) {
    setBusy(id ?? "all"); setError("");
    try {
      if (id) await api.markRead(id); else await api.markAllRead();
      const now = new Date().toISOString();
      setRows(current => current.map(row => (!id || row.id === id) ? { ...row, readAt: row.readAt ?? now } : row));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update read status. Please try again."); }
    finally { setBusy(null); }
  }
  async function more() {
    if (!cursor) return;
    setBusy("more"); setError("");
    try {
      const page = await api.list(cursor);
      setRows(current => [...new Map([...current, ...page.items].map(row => [row.id, row])).values()]);
      setCursor(page.nextCursor);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load older notifications. Please try again."); }
    finally { setBusy(null); }
  }
  // One focused list. Transport outcomes belong to staff's outbox; recipients
  // can read their durable notice even when its email could not be delivered.
  return <section aria-label="Your notifications" className="min-w-0 space-y-4">
    {error ? <p role="alert" className="text-sm text-fg-danger">{error}</p> : null}
    {unread ? <div className="flex justify-end"><Button variant="outline" size="sm" disabled={!!busy} onClick={() => void read()}>
      <CheckCheck className="h-4 w-4" />{busy === "all" ? "Updating…" : "Mark all read"}
    </Button></div> : null}
    {!rows.length ? <EmptyState icon={Bell} title="You're all caught up" description="Schedule changes, results and team updates will appear here." /> :
      <ul className="divide-y divide-border rounded-lg border border-border bg-bg">
        {rows.map(row => {
          const title = row.subject || row.templateCode.replace(/[._]+/g, " ");
          return <li key={row.id} className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className={`min-w-0 break-words text-sm ${row.readAt ? "text-fg-muted" : "font-semibold text-fg"}`}>{title}</h2>
              <span className="text-xs text-fg-muted"><LocalDate iso={row.createdAt} format="monthDay" /></span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fg-muted">{row.body}</p>
            {!row.readAt ? <Button variant="ghost" size="sm" className="mt-2" disabled={!!busy} onClick={() => void read(row.id)}>
              {busy === row.id ? "Updating…" : "Mark read"}
            </Button> : <p className="mt-2 text-xs text-fg-muted">Read</p>}
          </li>;
        })}
      </ul>}
    {cursor ? <Button variant="outline" disabled={!!busy} onClick={() => void more()}>{busy === "more" ? "Loading…" : "Older notifications"}</Button> : null}
  </section>;
}
