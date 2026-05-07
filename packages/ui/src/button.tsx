"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Pill = full rounded (used for primary CTAs in the SuperAccountant style) */
  pill?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  // SuperAccountant pattern — vivid violet primary, white text
  primary:
    "bg-accent text-accent-fg hover:bg-[var(--accent-hover)] disabled:bg-accent/50",
  secondary:
    "bg-surface-2 text-fg hover:bg-surface-2/70 border border-border",
  outline:
    "bg-surface-1 text-fg border border-border hover:bg-surface-2 hover:border-border-strong",
  ghost: "bg-transparent text-fg hover:bg-surface-2",
  destructive: "bg-error text-white hover:bg-error/90"
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm"
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", pill = false, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium tracking-tight transition-all duration-fast ease-ease focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50",
        pill ? "rounded-full" : "rounded-md",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    />
  );
});
