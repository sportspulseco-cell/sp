"use client";

import {
  animate,
  useInView,
  useMotionValue,
  useTransform,
  motion,
  useReducedMotion
} from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * Stat counter that animates from 0 → value once it scrolls into view.
 * Uses framer-motion's tween animator on a useMotionValue so React only
 * subscribes to the formatted output, not every frame.
 *
 * Reduced-motion: skips the animation and renders the final value
 * statically.
 */
export function Counter({
  value,
  duration = 1.2,
  className
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(reduce ? value : 0);
  const display = useTransform(mv, (latest) =>
    Math.round(latest).toLocaleString()
  );

  useEffect(() => {
    if (reduce) return;
    if (!inView) return;
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1]
    });
    return () => controls.stop();
  }, [inView, value, duration, mv, reduce]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
