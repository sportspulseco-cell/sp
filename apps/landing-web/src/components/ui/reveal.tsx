"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Component = "div"
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: keyof typeof motion;
}) {
  const reduce = useReducedMotion();
  const variants: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 24 },
    visible: { opacity: 1, y: 0 }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const M: any = motion[Component];
  return (
    <M
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: 0.55,
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      variants={variants}
    >
      {children}
    </M>
  );
}
