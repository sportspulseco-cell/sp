import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type Tint =
  | "violet"
  | "emerald"
  | "amber"
  | "blue"
  | "rose"
  | "cyan"
  | "neutral";

const TONES: Record<Tint, string> = {
  violet: "bg-[var(--tint-violet-bg)] text-[var(--tint-violet-fg)]",
  emerald: "bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]",
  amber: "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]",
  blue: "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-fg)]",
  rose: "bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)]",
  cyan: "bg-[var(--tint-cyan-bg)] text-[var(--tint-cyan-fg)]",
  neutral: "bg-surface-2 text-fg-muted"
};

export function IconTile({
  icon: Icon,
  tint = "violet",
  size = "md",
  className
}: {
  icon: LucideIcon;
  tint?: Tint;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { box: "h-7 w-7 rounded-md", icon: "h-3.5 w-3.5" },
    md: { box: "h-9 w-9 rounded-lg", icon: "h-4 w-4" },
    lg: { box: "h-11 w-11 rounded-lg", icon: "h-5 w-5" }
  };
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        sizes[size].box,
        TONES[tint],
        className
      )}
    >
      <Icon className={sizes[size].icon} strokeWidth={1.75} />
    </div>
  );
}
