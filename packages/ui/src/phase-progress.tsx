import { cn } from "./lib/cn";

export interface PhaseRow {
  index: number;
  label: string;
  done: number;
  total: number;
  /** Override progress percent (0–100) instead of done/total */
  pct?: number;
  /** "current" highlights with accent ring + text; "done"/"locked" mute */
  state?: "locked" | "current" | "done";
}

// Numbered timeline pattern from the SuperAccountant dashboard.
// Each row: a small numbered circle + label, count chip on the right,
// thin progress bar below. Uses accent for the current phase.
export function PhaseProgress({
  rows,
  className
}: {
  rows: PhaseRow[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-5", className)}>
      {rows.map((r) => {
        const pct = r.pct ?? (r.total > 0 ? (r.done / r.total) * 100 : 0);
        const isCurrent = r.state === "current";
        const isDone = r.state === "done" || pct >= 100;
        return (
          <li key={r.index} className="space-y-2">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium tabular-nums transition-colors duration-fast",
                  isCurrent
                    ? "bg-accent text-accent-fg"
                    : isDone
                    ? "border border-border bg-surface-2 text-fg"
                    : "border border-border bg-surface-1 text-fg-muted"
                )}
              >
                {r.index}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm font-medium",
                  isCurrent ? "text-fg" : "text-fg"
                )}
              >
                {r.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                {r.done}/{r.total}
              </span>
            </div>
            <div className="ml-8 h-[3px] overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-base ease-ease",
                  pct === 0 ? "bg-transparent" : "bg-accent"
                )}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
