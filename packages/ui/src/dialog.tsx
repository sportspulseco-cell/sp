"use client";

import { cn } from "./lib/cn";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl"
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        className={cn(
          // Cap the dialog at viewport height and let the body scroll —
          // tall forms (cascading scope pickers, role checklists) were
          // pushing submit buttons off-screen with no scrollbar before.
          "relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-lg border border-border bg-surface-1 shadow-md",
          widths[size]
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="space-y-1">
            <h2
              id="dialog-title"
              className="text-base font-semibold leading-none tracking-tight text-fg"
            >
              {title}
            </h2>
            {description ? (
              <p className="text-sm text-fg-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast ease-ease hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2">{children}</div>
  );
}
