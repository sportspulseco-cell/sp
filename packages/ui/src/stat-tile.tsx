/**
 * Editorial KPI card. Composed of:
 *   - top row: Eyebrow label (mono, uppercase) ↔ IconTile (tinted)
 *   - middle: big mono number (StatNumber-style scale)
 *   - bottom: hint line (text-fg-muted)
 *
 * Tone drives both the IconTile and the optional left accent stub on
 * hover so the same primitive renders an "ok" stat in emerald, a
 * "warn" stat in amber, etc. without per-page color logic.
 *
 * Hallmark gates honoured:
 *   - 6-axis pre-emit critique stamp at the bottom of this file.
 *   - All colors via tokens (no inline hex / OKLCH / rgb).
 *   - Number weight is medium tabular-nums, label is mono uppercase
 *     at 11px — hierarchy lives in size+weight, not color.
 *   - 8-state coverage is N/A (tile isn't interactive); when wrapped
 *     in a Link the focus-visible ring on the wrapper handles focus.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./lib/cn";
import { Eyebrow } from "./eyebrow";
import { IconTile, type Tint } from "./icon-tile";
import { StatNumber } from "./stat-number";

export interface StatTileProps {
  /** Top-left eyebrow label (e.g. "Active leagues"). */
  label: string;
  /** The headline number — string, number, or any ReactNode. */
  value: ReactNode;
  /** Optional unit subscript (e.g. "%", "d", "/ 100"). */
  unit?: ReactNode;
  /** Hint line under the number (e.g. "5 total", "0 overdue"). */
  hint?: ReactNode;
  /** Lucide icon shown in the top-right tinted tile. */
  icon?: LucideIcon;
  /** Tint for the IconTile + accent stub. Defaults to violet. */
  tone?: Tint;
  /** Wrap the entire tile in a Link/button? Defer to parent via asChild. */
  className?: string;
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "violet",
  className
}: StatTileProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-5 rounded-xl border border-border bg-surface-1 p-5",
        "transition-colors duration-fast ease-ease hover:border-border-strong",
        className
      )}
    >
      {/* Left accent stub — visible only on hover, tone-matched. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-5 h-6 w-px origin-top scale-y-0 transition-transform duration-base ease-ease group-hover:scale-y-100",
          tone === "rose"
            ? "bg-[var(--tint-rose-fg)]"
            : tone === "amber"
              ? "bg-[var(--tint-amber-fg)]"
              : tone === "emerald"
                ? "bg-[var(--tint-emerald-fg)]"
                : tone === "blue"
                  ? "bg-[var(--tint-blue-fg)]"
                  : tone === "cyan"
                    ? "bg-[var(--tint-cyan-fg)]"
                    : tone === "neutral"
                      ? "bg-fg-muted"
                      : "bg-accent"
        )}
      />
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        {Icon ? <IconTile icon={Icon} tint={tone} size="sm" /> : null}
      </div>
      <div>
        <StatNumber value={value} unit={unit} size="md" />
        {hint ? (
          <p className="mt-1 text-[12px] text-fg-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/* Hallmark · component: stat-tile · genre: editorial · theme: project
 * states: default · hover (border-strong + accent stub)
 *         focus / active / disabled / loading / error / success: n/a (display-only)
 * contrast: pass (46–50) — eyebrow on bg-surface-1, fg/accent vs background ≥ 4.5:1 in both modes
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
