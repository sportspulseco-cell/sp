"use client";
import { useId, useState, type ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * A heading with its explanation one click away instead of always on
 * screen (doc/design/guided-ui.md: progressive disclosure). Renders a
 * small (?) button after `children`; the text opens underneath.
 * Without `info` it renders `children` unchanged.
 */
export function InfoDisclosure({
  info,
  children,
  className
}: {
  info?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (info == null || info === "" || info === false) return <>{children}</>;
  return (
    <div className={className}>
      <div className="flex min-w-0 items-center gap-2">
        {children}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? "Hide explanation" : "What is this?"}
          title={open ? "Hide explanation" : "What is this?"}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus",
            open ? "border-[--accent] text-[--accent]" : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
          )}
        >
          ?
        </button>
      </div>
      {open ? (
        <div id={id} className="mt-2 max-w-2xl text-[14px] leading-relaxed text-fg-muted">
          {info}
        </div>
      ) : null}
    </div>
  );
}
