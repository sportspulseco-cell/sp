"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sticky 1px cyan heartbeat pinned to the bottom of the viewport.
 * Frequency and amplitude react to scroll velocity — idle = slow
 * gentle pulse, fast scroll = tighter, taller wave. The bar itself
 * is fixed; the inner waveform is an SVG path animated via
 * stroke-dashoffset.
 *
 * Shared across every SportsPulse web app (lifted from landing-web).
 * Drop into the root layout once; pointer-events:none so it never
 * blocks UI underneath.
 */
export function Heartbeat() {
  const [velocity, setVelocity] = useState(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const decay = useRef<number | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;
    lastT.current = performance.now();

    const onScroll = () => {
      const now = performance.now();
      const dy = Math.abs(window.scrollY - lastY.current);
      const dt = Math.max(1, now - lastT.current);
      const v = Math.min(1, dy / dt / 2); // 0..1
      lastY.current = window.scrollY;
      lastT.current = now;
      setVelocity((prev) => Math.max(prev, v));

      if (decay.current !== null) cancelAnimationFrame(decay.current);
      const start = performance.now();
      const startV = Math.max(velocity, v);
      const step = (t: number) => {
        const ratio = Math.min(1, (t - start) / 700);
        setVelocity(startV * (1 - ratio));
        if (ratio < 1) decay.current = requestAnimationFrame(step);
      };
      decay.current = requestAnimationFrame(step);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (decay.current !== null) cancelAnimationFrame(decay.current);
    };
  }, [velocity]);

  // amplitude: 1px at rest -> 10px when scrolling hard
  const amp = 1 + velocity * 9;
  // frequency: slow at rest -> 4x faster at peak velocity
  const periodMs = Math.max(600, 2400 - velocity * 1800);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[14px]"
      style={{
        background:
          "linear-gradient(180deg, transparent 0%, rgba(0, 27, 58, 0.65) 100%)"
      }}
    >
      <svg
        className="absolute inset-x-0 bottom-0 h-[14px] w-full"
        viewBox="0 0 1200 14"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sp-heartbeat-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(0, 242, 255, 0)" />
            <stop offset="20%" stopColor="rgba(0, 242, 255, 0.55)" />
            <stop offset="50%" stopColor="rgba(0, 242, 255, 1)" />
            <stop offset="80%" stopColor="rgba(0, 242, 255, 0.55)" />
            <stop offset="100%" stopColor="rgba(0, 242, 255, 0)" />
          </linearGradient>
        </defs>
        <path
          d={makeHeartbeatPath(1200, amp)}
          fill="none"
          stroke="url(#sp-heartbeat-grad)"
          strokeWidth={1}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 ${4 + velocity * 8}px rgba(0, 242, 255, ${
              0.45 + velocity * 0.4
            }))`
          }}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-1200"
            dur={`${periodMs}ms`}
            repeatCount="indefinite"
          />
          <set attributeName="stroke-dasharray" to="60 1200" />
        </path>
        {/* steady base line */}
        <line
          x1="0"
          y1="7"
          x2="1200"
          y2="7"
          stroke="rgba(0, 242, 255, 0.18)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

function makeHeartbeatPath(width: number, amp: number): string {
  // QRS-style cardiac pulse repeated across the viewport width
  const spikes = 8;
  const span = width / spikes;
  const mid = 7;
  let d = `M0 ${mid}`;
  for (let i = 0; i < spikes; i++) {
    const x = i * span;
    d += ` L${x + span * 0.3} ${mid}`;
    d += ` L${x + span * 0.35} ${mid - amp * 0.4}`;
    d += ` L${x + span * 0.4} ${mid + amp}`;
    d += ` L${x + span * 0.45} ${mid - amp * 1.5}`;
    d += ` L${x + span * 0.5} ${mid + amp * 0.6}`;
    d += ` L${x + span * 0.55} ${mid}`;
  }
  d += ` L${width} ${mid}`;
  return d;
}
