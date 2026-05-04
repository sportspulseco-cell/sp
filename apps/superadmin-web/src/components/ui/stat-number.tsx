import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// SuperAccountant-style big stat: huge mono number with a small unit subscript.
// Examples: "0%", "0d", "0/100", "5/16"
export function StatNumber({
  value,
  unit,
  size = "md",
  className
}: {
  value: ReactNode;
  unit?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { num: "text-2xl", unit: "text-xs" },
    md: { num: "text-4xl", unit: "text-sm" },
    lg: { num: "text-5xl", unit: "text-base" }
  };
  const s = sizes[size];
  return (
    <div className={cn("flex items-baseline gap-1 font-mono", className)}>
      <span className={cn(s.num, "font-medium tabular-nums tracking-tight text-fg")}>
        {value}
      </span>
      {unit ? (
        <span className={cn(s.unit, "font-medium text-fg-muted")}>
          {unit}
        </span>
      ) : null}
    </div>
  );
}
