"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { communications } from "@/lib/api/browser-api";
import { Button } from "@sportspulse/ui";

export function FlushQueuedButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-3">
      {result && <span className="text-[12px] text-fg-muted">{result}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending || count === 0}
        title="Sends queued notices from the last 24 hours. Older ones are never sent late."
        onClick={() => {
          start(async () => {
            try {
              const r = await communications.flushQueued();
              setResult(
                `Sent ${r.sent}, failed ${r.failed}.` +
                  (r.skippedStale
                    ? ` ${r.skippedStale} older than 24 hours were not sent.`
                    : "")
              );
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
    </span>
  );
}

export function RetryNotificationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
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
      variant="outline"
      size="sm"
      className="gap-1.5"
    >
      {pending ? "..." : "Retry"}
    </Button>
  );
}
