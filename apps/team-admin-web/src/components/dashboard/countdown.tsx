"use client";

import { useEffect, useState } from "react";

/**
 * Off-season countdown to the next registration opens-at. Updates
 * every minute. Falls back to "Registration dates not yet announced"
 * when the target is null.
 */
export function Countdown({ targetIso }: { targetIso: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(handle);
  }, []);

  if (!targetIso) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
        Registration dates not yet announced
      </p>
    );
  }

  const target = new Date(targetIso).getTime();
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  if (diff === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
        Registration is now open — refresh the page
      </p>
    );
  }

  return (
    <div className="inline-flex items-baseline gap-2 rounded-md bg-amber-100 px-3 py-1.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
        Next registration opens in
      </span>
      <span className="font-mono text-[15px] font-semibold tabular-nums">
        {days}d {hours}h
      </span>
    </div>
  );
}
