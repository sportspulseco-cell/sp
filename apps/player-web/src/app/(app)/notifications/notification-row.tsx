"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarRange,
  CircleDollarSign,
  ScrollText,
  ShieldAlert,
  type LucideIcon
} from "lucide-react";
import { Badge, IconTile } from "@sportspulse/ui";
import type { Notification } from "@sportspulse/api-client";
import { communications } from "@/lib/api/browser-api";

function iconFor(code: string): LucideIcon {
  if (code.includes("payment") || code.includes("invoice")) return CircleDollarSign;
  if (code.includes("game") || code.includes("schedule")) return CalendarRange;
  if (code.includes("comply") || code.includes("waiver")) return ShieldAlert;
  if (code.includes("registration")) return ScrollText;
  return Bell;
}

function tintFor(
  code: string
): "blue" | "violet" | "amber" | "rose" | "emerald" | "cyan" | "neutral" {
  if (code.includes("payment") || code.includes("invoice")) return "amber";
  if (code.includes("game") || code.includes("schedule")) return "blue";
  if (code.includes("comply") || code.includes("waiver")) return "rose";
  if (code.includes("registration")) return "violet";
  return "neutral";
}

function fmt(iso: string | null): string {
  if (!iso) return "queued";
  const diff = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Single notification row. Click anywhere on the row to mark-as-read
 * (idempotent — server stamps read_at the first time only). Unread
 * rows get a subtle blue tint + the dot indicator.
 */
export function NotificationRow({ notif }: { notif: Notification }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic readAt — flips immediately on click so the row visually
  // settles before the server round-trip completes.
  const [optimisticReadAt, setOptimisticReadAt] = useState<string | null>(
    notif.readAt
  );
  const isRead = optimisticReadAt != null;

  function onClick() {
    if (isRead) return;
    setOptimisticReadAt(new Date().toISOString());
    startTransition(async () => {
      try {
        await communications.markRead(notif.id);
        router.refresh();
      } catch {
        // revert on failure
        setOptimisticReadAt(notif.readAt);
      }
    });
  }

  return (
    <li
      onClick={onClick}
      className={
        "flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors " +
        (isRead ? "hover:bg-surface-2" : "bg-blue-500/5 hover:bg-blue-500/10") +
        (pending ? " opacity-70" : "")
      }
    >
      <IconTile icon={iconFor(notif.templateCode)} tint={tintFor(notif.templateCode)} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {!isRead ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          ) : null}
          <p className={isRead ? "text-[13px] text-fg-muted" : "text-[13px] font-medium text-fg"}>
            {notif.subject ?? notif.templateCode}
          </p>
          <Badge
            mono
            tone={
              notif.status === "sent"
                ? "success"
                : notif.status === "failed"
                  ? "danger"
                  : notif.status === "queued"
                    ? "warning"
                    : "neutral"
            }
          >
            {notif.status}
          </Badge>
        </div>
        <p className="mt-0.5 line-clamp-3 text-[12px] text-fg-muted">{notif.body}</p>
      </div>
      <p className="shrink-0 font-mono text-[10px] text-fg-muted">{fmt(notif.sentAt)}</p>
    </li>
  );
}
