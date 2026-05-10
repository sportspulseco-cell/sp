"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Live status dot with an outward-pinging ring. Drop in next to a label
 * to mark "currently happening" state — live games, live deploys, etc.
 *
 * Tone defaults to accent (violet); pass "success"/"error"/"cyan" for
 * green/red/cyan glow variants.
 */
export function LiveDot({
  tone = "accent",
  className
}: {
  tone?: "accent" | "success" | "error" | "cyan";
  className?: string;
}) {
  const ringByTone: Record<string, string> = {
    accent: "bg-[--accent]/70",
    success: "bg-emerald-500/70",
    error: "bg-rose-500/70",
    cyan: "bg-cyan-500/70"
  };
  const dotByTone: Record<string, string> = {
    accent: "bg-[--accent]",
    success: "bg-emerald-500",
    error: "bg-rose-500",
    cyan: "bg-cyan-500"
  };
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full",
          ringByTone[tone]
        )}
      />
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          dotByTone[tone]
        )}
      />
    </span>
  );
}

/**
 * Endless marquee rail. Renders `items` twice back-to-back and animates
 * the wrapper -50%, so the loop is seamless. Use `speed="fast"` for
 * dense activity rails, default for editorial captions.
 */
export function MarqueeRail({
  items,
  speed = "default",
  className
}: {
  items: { key: string; node: React.ReactNode }[];
  speed?: "default" | "fast";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const all = [...items, ...items];
  return (
    <div
      className={cn(
        "relative overflow-hidden border-y border-border bg-bg-subtle py-3",
        className
      )}
    >
      <div
        className={cn(
          "flex w-fit items-center whitespace-nowrap will-change-transform",
          !reduce &&
            (speed === "fast" ? "animate-ticker-fast" : "animate-ticker")
        )}
      >
        {all.map((it, i) => (
          <span
            key={`${it.key}-${i}`}
            className="flex items-center gap-6 px-6 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted"
          >
            {it.node}
            <span aria-hidden className="h-1 w-1 rounded-full bg-fg-subtle" />
          </span>
        ))}
      </div>
      {/* Edge fades so the loop doesn't have a hard cut */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-bg-subtle to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg-subtle to-transparent"
      />
    </div>
  );
}

/**
 * Sweeping highlight bar — pairs with `overflow-hidden` on a card and
 * sits absolutely on top of static content, fading in then out as it
 * crosses left to right. Use sparingly; it's an attention magnet.
 */
export function ScanSheen({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-scan",
        "bg-gradient-to-r from-transparent via-[--accent]/20 to-transparent",
        className
      )}
    />
  );
}

/**
 * Inline EKG / waveform — a tiny SVG that traces a heartbeat curve and
 * loops via dasharray drift. Drop into a corner to give a card a
 * "living" pulse without text.
 */
export function EkgLine({
  width = 88,
  height = 28,
  className,
  tone = "accent"
}: {
  width?: number;
  height?: number;
  className?: string;
  tone?: "accent" | "success" | "fg";
}) {
  const reduce = useReducedMotion();
  const stroke =
    tone === "success"
      ? "rgb(16, 185, 129)"
      : tone === "fg"
        ? "var(--fg)"
        : "var(--accent)";
  // Single repeating heartbeat segment (24 wide). We render it twice and
  // animate translateX so the line scrolls without a seam.
  const segment = "M0,14 L6,14 L8,8 L11,20 L14,4 L17,22 L20,14 L24,14";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
      role="presentation"
    >
      <motion.g
        initial={{ x: 0 }}
        animate={reduce ? { x: 0 } : { x: -24 }}
        transition={{
          duration: 1.4,
          ease: "linear",
          repeat: reduce ? 0 : Infinity
        }}
      >
        {Array.from({ length: Math.ceil(width / 24) + 2 }).map((_, i) => (
          <path
            key={i}
            d={segment}
            transform={`translate(${i * 24}, ${(height - 28) / 2})`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        ))}
      </motion.g>
    </svg>
  );
}
