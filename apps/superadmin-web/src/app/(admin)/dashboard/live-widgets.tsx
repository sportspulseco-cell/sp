"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Tick-by-tick demo game clock for the LiveGameCard. Pure ornament —
 * not tied to a real game; counts down second-by-second and rolls
 * quarters. Same pattern as landing-web's hero LiveGameCard.
 */
export function GameClock() {
  const [clock, setClock] = useState({ q: 3, mm: 8, ss: 42 });
  useEffect(() => {
    const t = setInterval(() => {
      setClock((c) => {
        let { q, mm, ss } = c;
        ss--;
        if (ss < 0) {
          ss = 59;
          mm--;
        }
        if (mm < 0) {
          mm = 11;
          q = Math.min(4, q + 1);
        }
        return { q, mm, ss };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono text-[12px] tabular-nums text-fg">
      Q{clock.q} · {pad(clock.mm)}:{pad(clock.ss)}
    </span>
  );
}

/**
 * Width-fill progress bar that animates from 0 → value% on viewport
 * entry, then sits. Use for review-queue completion, target progress,
 * etc. Reduced-motion: jumps to value with no animation.
 */
export function ProgressBar({ value }: { value: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
      <motion.div
        initial={{ width: reduce ? `${value}%` : 0 }}
        whileInView={{ width: `${value}%` }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ once: true }}
        className="h-full bg-[--accent]"
      />
    </div>
  );
}

/**
 * 4-bar mini chart whose bars grow on viewport entry. `height` is a
 * 0–1 scalar of the column's relative magnitude. Same shape as
 * landing-web's SchedulerCard fixtures.
 */
export function BarChart({
  data
}: {
  data: { label: string; value: number; height: number }[];
}) {
  return (
    <div className="mt-5 grid grid-cols-4 items-end gap-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex flex-col items-center gap-1.5">
          <div className="relative flex h-12 w-full items-end">
            <motion.div
              initial={{ scaleY: 0.05, opacity: 0.3 }}
              whileInView={{ scaleY: d.height, opacity: 1 }}
              transition={{
                duration: 0.7,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1]
              }}
              viewport={{ once: true }}
              style={{ transformOrigin: "bottom" }}
              className="absolute inset-x-0 bottom-0 rounded-sm bg-fg"
            />
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-fg-muted">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}
