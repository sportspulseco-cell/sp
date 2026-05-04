"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Heart, ShieldCheck, TrendingUp } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

const BULLETS = [
  "SafeSport compliance automation",
  "Injury risk early warning",
  "Performance trend analysis"
];

export function SectionIntelligence() {
  return (
    <Section id="intelligence">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>// 05 · Intelligence Layer</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-[clamp(36px,5vw,64px)] font-semibold leading-[1.04] tracking-tighter text-balance text-fg">
              We move at game speed.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
              Predictive analytics surfaces player health trends, compliance
              status, and performance benchmarks before they become issues.
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

        <div className="lg:col-span-7">
          <Reveal delay={0.05}>
            <PlayerHealthCard />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

function PlayerHealthCard() {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-bg-elev p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-cyan font-mono text-[15px] font-semibold tracking-wide text-bg">
            JR
          </div>
          <div>
            <p className="text-[16px] font-semibold tracking-tight text-fg">
              Jordan Rivera
            </p>
            <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
              MF · U14 Elite · #11
            </p>
          </div>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-fg-muted sm:inline">
          Player Card
        </span>
      </div>

      {/* Performance Pulse — animated wavy SVG */}
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-bg p-5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Performance Pulse · last 18 games
          </p>
          <p className="font-mono text-[22px] font-semibold tabular-nums tracking-tighter text-fg">
            94<span className="text-fg-muted text-[14px]">/100</span>
          </p>
        </div>
        <PerformancePulse />
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Games" value="18" />
        <Stat label="Goals + A" value="14" />
        <Stat label="Injury risk" value="Low" tint="success" />
      </div>

      {/* Badges */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Badge icon={<ShieldCheck className="h-3 w-3" strokeWidth={2.25} />}>
          SafeSport Verified
        </Badge>
        <Badge icon={<Heart className="h-3 w-3" strokeWidth={2.25} />}>
          Injury Risk: Low
        </Badge>
        <Badge icon={<TrendingUp className="h-3 w-3" strokeWidth={2.25} />}>
          Peak Season
        </Badge>
      </div>
    </article>
  );
}

function PerformancePulse() {
  // Slightly noisy upward-trending data — looks like a real heart-rate trace.
  const pts = [
    62, 68, 64, 76, 71, 80, 78, 84, 81, 89, 85, 92, 88, 94, 91, 96, 93, 98
  ];
  const w = 600;
  const h = 120;
  const padX = 8;
  const padY = 16;
  const xStep = (w - padX * 2) / (pts.length - 1);
  const min = 55;
  const max = 100;
  const yScale = (v: number) =>
    padY + (h - padY * 2) * (1 - (v - min) / (max - min));

  // Build a smoothed path
  const d = pts
    .map((p, i) => {
      const x = padX + i * xStep;
      const y = yScale(p);
      if (i === 0) return `M ${x} ${y}`;
      const prev = pts[i - 1] ?? p;
      const cx1 = padX + (i - 0.5) * xStep;
      const cy1 = yScale(prev);
      const cx2 = padX + (i - 0.5) * xStep;
      const cy2 = y;
      return `C ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`;
    })
    .join(" ");

  // Area beneath the line
  const area = `${d} L ${padX + (pts.length - 1) * xStep} ${h - padY} L ${padX} ${h - padY} Z`;

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full">
        <defs>
          <linearGradient id="pulse-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pulse-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
          <filter id="pulse-glow">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Faint horizontal guides */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padX}
            y1={padY + (h - padY * 2) * p}
            x2={w - padX}
            y2={padY + (h - padY * 2) * p}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}

        {/* Area */}
        <motion.path
          d={area}
          fill="url(#pulse-fill)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.5 }}
          viewport={{ once: true }}
        />

        {/* Stroke */}
        <motion.path
          d={d}
          fill="none"
          stroke="url(#pulse-stroke)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#pulse-glow)"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
        />

        {/* Latest point */}
        <motion.circle
          cx={padX + (pts.length - 1) * xStep}
          cy={yScale(pts[pts.length - 1] as number)}
          r={4}
          fill="var(--cyan)"
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 1.6, type: "spring", stiffness: 240 }}
          viewport={{ once: true }}
        />
        <motion.circle
          cx={padX + (pts.length - 1) * xStep}
          cy={yScale(pts[pts.length - 1] as number)}
          r={9}
          fill="var(--cyan)"
          opacity={0.25}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.25 }}
          transition={{ duration: 0.4, delay: 1.7 }}
          viewport={{ once: true }}
          className="animate-pulse-slow"
        />
      </svg>
    </div>
  );
}

function Stat({
  label,
  value,
  tint
}: {
  label: string;
  value: string;
  tint?: "success";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p
        className={`mt-1.5 font-mono text-[18px] font-semibold tabular-nums tracking-tight ${
          tint === "success" ? "text-success" : "text-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Badge({
  icon,
  children
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
      <span className="text-cyan">{icon}</span>
      {children}
    </span>
  );
}
