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
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {result && <span role="status" className="text-[12px] text-fg-muted">{result}</span>}
      {error && <span role="alert" className="max-w-xs text-xs text-fg-muted">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending || count === 0}
        title="Sends queued notices from the last 24 hours. Older ones are never sent late."
        onClick={() => {
          start(async () => {
            setError(""); setResult(null);
            try {
              const r = await communications.flushQueued();
              setResult(
                `Processed ${r.sent}, failed ${r.failed}, not sent ${r.suppressed}.` +
                  (r.skippedStale
                    ? ` ${r.skippedStale} older than 24 hours were not sent.`
                    : "")
              );
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="mr-2 h-3.5 w-3.5" />
        )}
        {count > 20 ? "Send next 20" : `Send queued${count > 0 ? ` (${count})` : ""}`}
      </Button>
    </span>
  );
}

export function RetryNotificationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-wrap justify-end gap-2"><Button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          setError("");
          try {
            await communications.retry(id);
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          }
        });
      }}
      variant="outline"
      size="sm"
      className="gap-1.5"
    >
      {pending ? "Retrying…" : "Retry"}
    </Button>{error ? <span role="alert" className="max-w-xs text-xs text-fg-muted">{error}</span> : null}</span>
  );
}
