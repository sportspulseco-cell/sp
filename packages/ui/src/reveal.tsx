"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * Editorial entrance reveal — opacity + lift, with the same easing
 * curve landing-web uses ([0.22, 1, 0.36, 1]). Honours
 * prefers-reduced-motion (collapses y to 0).
 *
 * Shared across every SportsPulse web app so the entrance feel is
 * consistent everywhere.
 *
 *   <Reveal delay={i * 0.06}>{row}</Reveal>  // stagger list rows
 *   <Reveal y={32} duration={0.7}>{hero}</Reveal>  // bigger sections
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  duration = 0.55,
  className,
  as: Component = "div",
  once = true
}: {
  children: ReactNode;
  delay?: number;
  /** Vertical offset (in px) the element starts below its final spot. */
  y?: number;
  duration?: number;
  className?: string;
  as?: keyof typeof motion;
  /** Replay every time the element scrolls into view. Default: only once. */
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const variants: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    visible: { opacity: 1, y: 0 }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const M: any = motion[Component];
  return (
    <M
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-80px" }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      variants={variants}
    >
      {children}
    </M>
  );
}
