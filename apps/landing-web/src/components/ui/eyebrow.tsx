import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Eyebrow({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] uppercase tracking-widest text-fg-muted",
        className
      )}
    >
      {children}
    </p>
  );
}
