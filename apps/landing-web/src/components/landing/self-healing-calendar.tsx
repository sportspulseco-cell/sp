"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const ROWS = 5; // 5 weeks
const CONFLICT_CELL = { row: 2, col: 4 }; // Fri of week 3
const PHASES = ["idle", "scanning", "resolving", "resolved"] as const;
type Phase = (typeof PHASES)[number];

export function SelfHealingCalendar() {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    const seq: Array<[Phase, number]> = [
      ["idle", 1200],
      ["scanning", 2400],
      ["resolving", 1600],
      ["resolved", 3000]
    ];
    let i = 0;
    const tick = () => {
      const [next, hold] = seq[i] ?? ["idle", 1500];
      setPhase(next);
      i = (i + 1) % seq.length;
      timeout = setTimeout(tick, hold);
    };
    let timeout = setTimeout(tick, 800);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-elev p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            October 2025 · Schedule
          </p>
          <p className="mt-1 text-[15px] font-medium text-fg">
            Self-Healing Calendar
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="inline-flex items-center gap-1.5 text-fg-muted"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-fg-muted" />
                </span>
                Idle
              </motion.span>
            )}
            {phase === "scanning" && (
              <motion.span
                key="scan"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="inline-flex items-center gap-1.5 text-cyan"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
                </span>
                AI Scanning
              </motion.span>
            )}
            {phase === "resolving" && (
              <motion.span
                key="resolve"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="inline-flex items-center gap-1.5 text-warning"
              >
                <Sparkles className="h-3 w-3" strokeWidth={2} />
                Resolving
              </motion.span>
            )}
            {phase === "resolved" && (
              <motion.span
                key="ok"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="inline-flex items-center gap-1.5 text-success"
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
                AI Optimized
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Day labels */}
      <div className="mt-5 grid grid-cols-7 gap-1.5 px-0.5">
        {DAYS.map((d) => (
          <p
            key={d}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle"
          >
            {d}
          </p>
        ))}
      </div>

      {/* Grid */}
      <div className="relative mt-2 overflow-hidden rounded-lg">
        {/* Scanning sweep — only visible during 'scanning' phase */}
        <AnimatePresence>
          {phase === "scanning" && (
            <motion.div
              key="sweep"
              initial={{ x: "-30%", opacity: 0 }}
              animate={{ x: "130%", opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.0, ease: [0.45, 0, 0.55, 1] }}
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 bg-gradient-to-r from-transparent via-cyan/25 to-transparent blur-sm"
            />
          )}
        </AnimatePresence>

        <div className="relative grid grid-cols-7 gap-1.5">
          {Array.from({ length: ROWS * 7 }).map((_, idx) => {
            const row = Math.floor(idx / 7);
            const col = idx % 7;
            const isConflict =
              row === CONFLICT_CELL.row && col === CONFLICT_CELL.col;
            return (
              <Cell
                key={idx}
                row={row}
                col={col}
                isConflict={isConflict}
                phase={phase}
              />
            );
          })}
        </div>
      </div>

      {/* Resolution callout */}
      <AnimatePresence>
        {phase === "resolved" && (
          <motion.div
            key="callout"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.32 }}
            className="mt-4 flex items-start gap-2.5 rounded-md border border-success/30 bg-success/5 px-3.5 py-2.5"
          >
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.25} />
            <div className="flex-1">
              <p className="text-[12px] font-medium text-fg">
                AI Optimization · Conflict Resolved
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                Game #042 moved 2025-10-17 19:00 → 2025-10-18 14:30 · venue
                conflict cleared · referee re-assigned
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Faux gradient floor */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-12 bg-gradient-to-t from-bg-elev to-transparent" />
    </div>
  );
}

function Cell({
  row,
  col,
  isConflict,
  phase
}: {
  row: number;
  col: number;
  isConflict: boolean;
  phase: Phase;
}) {
  const filled =
    (row * 7 + col) % 3 !== 1 && !isConflict; // pseudo-random "scheduled"

  let stateClass = "border-border bg-surface-1";
  let label = "";
  if (isConflict) {
    if (phase === "idle" || phase === "scanning") {
      stateClass = "border-error/50 bg-error/10 text-error";
      label = "Conflict";
    } else if (phase === "resolving") {
      stateClass = "border-warning/40 bg-warning/10 text-warning";
      label = "…";
    } else if (phase === "resolved") {
      stateClass = "border-cyan/40 bg-cyan/10 text-cyan";
      label = "Resolved";
    }
  } else if (filled) {
    stateClass = "border-border-strong bg-surface-2 text-fg-muted";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.32,
        delay: (row + col) * 0.018,
        ease: [0.22, 1, 0.36, 1]
      }}
      viewport={{ once: true }}
      className={`relative flex aspect-square min-h-[40px] items-center justify-center rounded-md border text-[10px] font-medium transition-colors duration-300 ${stateClass}`}
    >
      {isConflict ? (
        <div className="flex flex-col items-center gap-0.5">
          {phase !== "resolved" ? (
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          <span className="font-mono text-[9px] uppercase tracking-wider">
            {label}
          </span>
        </div>
      ) : filled ? (
        <span className="h-1 w-1 rounded-full bg-fg-subtle" />
      ) : null}
    </motion.div>
  );
}
