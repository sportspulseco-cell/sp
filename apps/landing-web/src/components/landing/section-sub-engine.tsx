"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Search } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

const BULLETS = [
  "Eligible backups identified in sub-5 seconds",
  "Officials credential & certification verified",
  "The game never stops"
];

type Phase = "alert" | "matching" | "filled";

export function SectionSubEngine() {
  return (
    <Section id="sub-engine">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="order-2 lg:order-1 lg:col-span-7">
          <Reveal>
            <SubEngineRoster />
          </Reveal>
        </div>
        <div className="order-1 lg:order-2 lg:col-span-5">
          <Reveal>
            <Eyebrow>// 02 · Sub-Engine</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-[clamp(36px,5vw,64px)] font-semibold leading-[1.04] tracking-tighter text-balance text-fg">
              We don't just alert you to gaps. <span className="text-electric">We fill them.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
              Our automated substitution and referee module identifies
              eligible backups and officials in sub-5 seconds, ensuring the
              game never stops.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <ul className="mt-7 space-y-2.5">
              {BULLETS.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2.5 text-[14px] text-fg"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-cyan"
                    strokeWidth={2}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

function SubEngineRoster() {
  const [phase, setPhase] = useState<Phase>("alert");
  const [match, setMatch] = useState(0);

  useEffect(() => {
    const seq: Array<[Phase, number]> = [
      ["alert", 1800],
      ["matching", 2800],
      ["filled", 3000]
    ];
    let i = 0;
    const tick = () => {
      const [next, hold] = seq[i] ?? ["alert", 1500];
      setPhase(next);
      i = (i + 1) % seq.length;
      timeout = setTimeout(tick, hold);
    };
    let timeout = setTimeout(tick, 600);
    return () => clearTimeout(timeout);
  }, []);

  // Smooth match-rate climb during 'matching' phase.
  useEffect(() => {
    if (phase !== "matching") {
      if (phase === "filled") setMatch(94);
      else setMatch(0);
      return;
    }
    setMatch(0);
    const start = performance.now();
    const id = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / 2400);
      const eased = 1 - Math.pow(1 - t, 3);
      setMatch(Math.round(94 * eased));
      if (t < 1) requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-elev">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Game #4 · Saturday Roster
        </p>
        <AnimatePresence mode="wait">
          {phase === "alert" && (
            <motion.span
              key="alert"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-error"
            >
              <AlertCircle className="h-3 w-3" strokeWidth={2} /> Drop detected
            </motion.span>
          )}
          {phase === "matching" && (
            <motion.span
              key="match"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan"
            >
              <Search className="h-3 w-3 animate-pulse" strokeWidth={2} />{" "}
              Matching
            </motion.span>
          )}
          {phase === "filled" && (
            <motion.span
              key="ok"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-success"
            >
              <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} /> Filled
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <ul className="divide-y divide-border">
        <RosterRow num="01" name="Kim Rodriguez" role="GK" team="Team A" status="active" />
        <ReferRow phase={phase} matchPct={match} />
        <RosterRow num="07" name="Sara Lee" role="MF" team="Team B" status="active" />
        <RosterRow num="11" name="Jordan Rivera" role="MF" team="Team A" status="active" />
        <RosterRow num="15" name="Tomás Castillo" role="DF" team="Team B" status="active" />
      </ul>

      {/* Match-rate progress bar */}
      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <span>Replacement Match</span>
          <span className="tabular-nums text-fg">{match}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            animate={{ width: `${match}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`h-full ${
              phase === "filled" ? "bg-success" : "bg-cyan"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

function RosterRow({
  num,
  name,
  role,
  team,
  status
}: {
  num: string;
  name: string;
  role: string;
  team: string;
  status: "active";
}) {
  return (
    <li className="grid grid-cols-[40px_1fr_64px_92px_88px] items-center gap-3 px-5 py-3 sm:grid-cols-[44px_1fr_72px_120px_92px]">
      <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
        #{num}
      </span>
      <span className="truncate text-[13px] font-medium text-fg">{name}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {role}
      </span>
      <span className="hidden text-[11px] text-fg-muted sm:block">{team}</span>
      <span className="inline-flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Active
      </span>
    </li>
  );
}

function ReferRow({ phase, matchPct }: { phase: Phase; matchPct: number }) {
  // The conflict row: Marcus Jones, the no-show ref. Animates through phases.
  let pillClass = "bg-error/10 text-error";
  let pillLabel = "No-show";
  if (phase === "matching") {
    pillClass = "bg-cyan/10 text-cyan";
    pillLabel = `Matching ${matchPct}%`;
  } else if (phase === "filled") {
    pillClass = "bg-success/10 text-success";
    pillLabel = "Filled";
  }
  return (
    <motion.li
      animate={{
        backgroundColor:
          phase === "alert"
            ? "rgba(255,80,80,0.04)"
            : phase === "matching"
              ? "rgba(34,211,238,0.04)"
              : "rgba(70,211,105,0.04)"
      }}
      transition={{ duration: 0.4 }}
      className="relative grid grid-cols-[40px_1fr_64px_64px_120px] items-center gap-3 px-5 py-3 sm:grid-cols-[44px_1fr_72px_120px_140px]"
    >
      {/* Heartbeat pulse rail on the left */}
      <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
        #04
      </span>
      <span className="truncate text-[13px] font-medium text-fg">
        Marcus Jones
        <AnimatePresence>
          {phase === "filled" && (
            <motion.span
              key="arrow"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              className="ml-2 font-mono text-[11px] text-fg-muted"
            >
              → Priya Shah
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Ref
      </span>
      <span className="hidden text-[11px] text-fg-muted sm:block">
        Game #4
      </span>
      <span
        className={`inline-flex items-center justify-end gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${pillClass}`}
      >
        {phase === "matching" && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
          </span>
        )}
        {pillLabel}
      </span>
    </motion.li>
  );
}
