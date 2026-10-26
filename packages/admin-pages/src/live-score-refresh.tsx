"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Live scores without a reload (FR-3.5.2). While a game on the page is in
 * play, re-render the server page every `intervalMs` (default 10 s) so
 * the score the scorekeeper enters shows up; stops when nothing is live
 * and while the tab is hidden. Polling, not Realtime: the score lives in
 * the API's database and no broadcast is sent on score changes.
 */
export function LiveScoreRefresh({ active, intervalMs = 10_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);
  if (!active) return null;
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted" aria-live="polite">
      Live · scores update every {Math.round(intervalMs / 1000)} s
    </p>
  );
}
