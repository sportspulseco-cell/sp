"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Editorial hero header — borrows the landing-web hero treatment:
 *   - Layered backdrop (dot grid faded at edges + accent radial glow)
 *   - Mono "// eyebrow · v2" overline
 *   - Display headline that reflows to fit (`clamp(36px, 6vw, 84px)`)
 *   - Optional sub + actions slot
 *
 * Light-mode tuned. Drop into any page that should feel like a
 * page-of-record rather than a utility.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-border bg-surface-1",
        className
      )}
    >
      {/* Backdrop: line grid (masked at edges) + soft accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-light mask-fade-edges opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-radial-fade-light"
      />
      {/* Hero glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-[--accent]/[0.10] blur-[120px]"
      />

      <div className="relative px-7 pb-9 pt-12 lg:px-10 lg:pb-12 lg:pt-16">
        {eyebrow ? (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted"
          >
            {eyebrow}
          </motion.p>
        ) : null}

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 max-w-[22ch] text-balance font-sans text-[clamp(36px,6vw,84px)] font-semibold leading-[0.95] tracking-tighter text-fg"
        >
          {title}
        </motion.h1>

        {subtitle ? (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted"
          >
            {subtitle}
          </motion.p>
        ) : null}

        {actions ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-wrap items-center gap-2.5"
          >
            {actions}
          </motion.div>
        ) : null}

        {children ? <div className="relative mt-10">{children}</div> : null}
      </div>
    </section>
  );
}
