import { cn } from "./lib/cn";
import type { ReactNode } from "react";

// Small muted label above a value or heading, optionally with a dot.
// Sentence case, body font (doc/design/guided-ui.md).
export function Eyebrow({
  children,
  dot,
  dotColor = "var(--success)",
  className
}: {
  children: ReactNode;
  dot?: boolean;
  dotColor?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[13px] font-medium text-fg-muted first-letter:uppercase",
        "flex items-center gap-2",
        className
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
        />
      ) : null}
      {children}
    </p>
  );
}

// Small pill chip (used like "0 ITEMS", "LOCKED")
export function Chip({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md border border-border bg-surface-1 px-2",
        "text-[12px] font-medium text-fg-muted",
        className
      )}
    >
      {children}
    </span>
  );
}
