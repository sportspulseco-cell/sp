"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { Badge } from "@sportspulse/ui";
import { createSchedulerSupabaseClient } from "./scheduler-client";

/**
 * Pain #1 consumer side — subscribes to every season's
 * `schedule:season:<id>` channel and `router.refresh()`s the page
 * when a `schedule_published` or `schedule_updated` event arrives.
 *
 * Mount inside a server-rendered schedule view. Renders a tiny LIVE
 * indicator (or hidden if you pass `silent`); the heavy lifting is
 * Next.js's RSC refresh, which re-runs the parent server component
 * and re-renders the games list.
 *
 * Multi-season safe: if the player is in two seasons, pass both ids
 * and we subscribe to both channels.
 */
export function ScheduleRealtimeBridge({
  seasonIds,
  silent = false
}: {
  seasonIds: string[];
  silent?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "connecting" | "subscribed" | "errored" | "closed"
  >("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    if (seasonIds.length === 0) return;
    const sb = createSchedulerSupabaseClient();
    const channels = seasonIds.map((seasonId) => {
      const channel = sb.channel(`schedule:season:${seasonId}`);
      const onEvent = () => {
        setLastEventAt(Date.now());
        router.refresh();
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel.on("broadcast", { event: "schedule_published" }, onEvent as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel.on("broadcast", { event: "schedule_updated" }, onEvent as any);
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("subscribed");
        else if (s === "CLOSED") setStatus("closed");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("errored");
      });
      return channel;
    });
    return () => {
      for (const c of channels) sb.removeChannel(c);
    };
  }, [seasonIds, router]);

  if (silent) return null;

  const tone =
    status === "subscribed"
      ? "success"
      : status === "errored" || status === "closed"
        ? "warning"
        : "neutral";

  return (
    <div
      aria-live="polite"
      className="inline-flex items-center gap-2 text-fg-muted"
    >
      <Badge tone={tone} dot mono>
        <Radio className="h-3 w-3" strokeWidth={1.75} />
        {status === "subscribed"
          ? "LIVE"
          : status === "connecting"
            ? "CONNECTING"
            : status === "closed"
              ? "OFFLINE"
              : "RECONNECTING"}
      </Badge>
      {lastEventAt !== null && (
        <span className="font-mono text-[10px] uppercase tracking-widest">
          updated {new Date(lastEventAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
