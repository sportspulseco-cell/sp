import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Mono uppercase eyebrow label, often paired with a leading dot or icon.
// Pattern from SuperAccountant: ● INDIA · CHARTERED PATH
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
        "font-mono text-[11px] font-medium uppercase tracking-wide text-fg-muted",
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
        "font-mono text-[10px] font-medium uppercase tracking-wide text-fg-muted",
        className
      )}
    >
      {children}
    </span>
  );
}
