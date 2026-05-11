"use client";

import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/reveal";
import { Counter } from "@/components/motion/counter";
import { LiveDot, ScanSheen } from "@/components/motion/kinetic";

export interface KineticCard {
  /** Mono uppercase label */
  label: string;
  /** Big numeric. Animates 0 → value via <Counter>. Use string for free-form values like "—" or "$1.2k". */
  value: number | string;
  /** Optional caption underneath */
  hint?: string;
  /**
   * Optional icon JSX rendered in the top-right corner. Pass a rendered
   * element (e.g. `<FileSignature className="h-3.5 w-3.5" />`) NOT a
   * component reference — server pages can't serialize forwardRef
   * component types as data props to client components.
   */
  icon?: ReactNode;
  /**
   * "live" → red ping dot + scan sheen sweeping across (continuous motion)
   * "warn" → amber accent dot
   * "ok"   → green ping dot
   * "info" → cyan ping dot
   * "idle" → no decoration
   */
  tone?: "live" | "warn" | "ok" | "info" | "idle";
  /** Optional unit suffix (eg "/24", "%"). */
  unit?: string;
  /** Optional element rendered to the right of the number — small chart, EKG line, etc. */
  trailing?: ReactNode;
}

/**
 * Reusable kinetic stat strip — drop it under any PageHeader to give
 * a list/detail page the same energy as /dashboard's hero strip.
 *
 *   <KineticStrip cards={[
 *     { label: "Active", value: 24, tone: "ok", hint: "of 32 total" },
 *     { label: "Suspended", value: 0, tone: "warn" },
 *     { label: "Pending invite", value: 5, tone: "live", icon: <Mail className="h-3.5 w-3.5" /> }
 *   ]} />
 */
export function KineticStrip({
  cards,
  trailing
}: {
  cards: KineticCard[];
  /** Optional 4th-cell content if cards.length === 3 (e.g. a marquee). */
  trailing?: ReactNode;
}) {
  return (
    <Reveal y={20}>
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
          cards.length === 3
            ? "lg:grid-cols-3"
            : cards.length === 4
              ? "lg:grid-cols-4"
              : "lg:grid-cols-2"
        }`}
      >
        {cards.map((c, i) => (
          <Card key={c.label} card={c} delay={i * 0.06} />
        ))}
        {trailing ? <div>{trailing}</div> : null}
      </div>
    </Reveal>
  );
}

function Card({ card, delay }: { card: KineticCard; delay: number }) {
  const isLive = card.tone === "live";
  return (
    <Reveal delay={delay}>
      <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
        {isLive ? <ScanSheen /> : null}
        <div className="relative flex items-center justify-between">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            {card.tone === "live" ? <LiveDot tone="error" /> : null}
            {card.tone === "warn" ? <LiveDot tone="accent" /> : null}
            {card.tone === "ok" ? <LiveDot tone="success" /> : null}
            {card.tone === "info" ? <LiveDot tone="cyan" /> : null}
            {card.label}
          </p>
          {card.icon ? (
            <span className="text-fg-muted">{card.icon}</span>
          ) : null}
        </div>
        <div className="relative mt-5 flex items-baseline gap-2">
          {typeof card.value === "number" ? (
            <Counter
              value={card.value}
              className="font-mono text-4xl font-semibold tabular-nums tracking-tighter text-fg"
            />
          ) : (
            <span className="font-mono text-4xl font-semibold tabular-nums tracking-tighter text-fg">
              {card.value}
            </span>
          )}
          {card.unit ? (
            <span className="font-mono text-base text-fg-muted">
              {card.unit}
            </span>
          ) : null}
          {card.trailing ? (
            <span className="ml-auto">{card.trailing}</span>
          ) : null}
        </div>
        {card.hint ? (
          <p className="relative mt-3 text-[12px] text-fg-muted">{card.hint}</p>
        ) : null}
      </article>
    </Reveal>
  );
}
