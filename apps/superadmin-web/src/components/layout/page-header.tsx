"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { LiveDot } from "@/components/motion/kinetic";

/**
 * Standard page header used on every admin list / detail screen.
 * Editorial register matching the landing site:
 *   - Mono `// eyebrow` overline with wide tracking
 *   - Display headline at clamp(34px, 4.6vw, 56px) — responsive to width
 *   - Optional accent live-dot before the eyebrow when `eyebrowDot`
 *   - Bottom hairline with a small accent chapter marker
 *   - Headline + description fade up on mount with framer-motion
 *
 * API kept stable (title / description / eyebrow / eyebrowDot / action)
 * so the 25+ existing callers don't have to change.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  eyebrowDot,
  action
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  eyebrowDot?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="relative mb-10 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          {eyebrow ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted"
            >
              {eyebrowDot ? (
                <LiveDot tone="accent" />
              ) : (
                <span className="text-fg-subtle/70">//</span>
              )}
              <span>{eyebrow}</span>
            </motion.div>
          ) : null}

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.55,
              delay: 0.04,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="max-w-[22ch] text-balance font-sans text-[clamp(34px,4.6vw,56px)] font-semibold leading-[0.96] tracking-tighter text-fg"
          >
            {title}
          </motion.h1>

          {description ? (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1]
              }}
              className="max-w-2xl text-[14px] leading-relaxed text-fg-muted"
            >
              {description}
            </motion.p>
          ) : null}
        </div>

        {action ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.16,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="shrink-0"
          >
            {action}
          </motion.div>
        ) : null}
      </div>

      {/* Editorial chapter rule — full hairline with a 24px accent
          stub on the left, like a magazine section opener. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center">
        <span className="h-px w-6 bg-[--accent]" />
        <span className="h-px flex-1 bg-border" />
      </div>
    </header>
  );
}
