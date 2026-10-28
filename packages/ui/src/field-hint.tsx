"use client";
import { useId, useState, type ReactNode } from "react";
import { cn } from "./lib/cn";

/** Hints up to this many words stay on screen; longer ones open on demand. */
const SHORT_WORDS = 8;

/**
 * Help text under a form field (doc/design/guided-ui.md: at most 8
 * words on screen). A short hint shows as is. A longer one becomes a
 * small "Help" button that opens the text, so the form stays scannable
 * and the detail is one click away.
 */
export function FieldHint({ children, className }: { children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (children == null || children === "" || children === false) return null;
  const words = typeof children === "string" ? (children.trim().match(/\S+/g) ?? []).length : Infinity;
  if (words <= SHORT_WORDS) return <p className={cn("text-[12px] text-fg-muted", className)}>{children}</p>;
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded text-[12px] text-fg-muted transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold",
            open ? "border-[--accent] text-[--accent]" : "border-border"
          )}
        >
          ?
        </span>
        {open ? "Hide help" : "Help"}
      </button>
      {open ? (
        <p id={id} className="mt-1 max-w-prose text-[12px] leading-relaxed text-fg-muted">
          {children}
        </p>
      ) : null}
    </div>
  );
}
