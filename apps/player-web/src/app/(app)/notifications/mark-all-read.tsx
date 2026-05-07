"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { communications } from "@/lib/api/browser-api";

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await communications.markAllRead();
        router.refresh();
      } catch {
        // swallow — UI already reflects the unread count from server state
      }
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCheck className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
      )}
      <span className="font-mono text-[10px] uppercase tracking-widest">
        Mark all read ({unreadCount})
      </span>
    </Button>
  );
}
