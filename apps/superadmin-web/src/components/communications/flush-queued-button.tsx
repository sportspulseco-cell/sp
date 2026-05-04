"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { communications } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";

export function FlushQueuedButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || count === 0}
      onClick={() => {
        start(async () => {
          try {
            await communications.flushQueued();
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
    >
      {pending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Send className="mr-2 h-3.5 w-3.5" />
      )}
      Flush {count > 0 ? `(${count})` : ""} queued
    </Button>
  );
}

export function RetryNotificationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-md border border-border bg-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg disabled:opacity-50"
      onClick={() => {
        start(async () => {
          try {
            await communications.retry(id);
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
    >
      {pending ? "..." : "Retry"}
    </button>
  );
}
