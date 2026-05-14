"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Activity, Users, CalendarRange, Wifi } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border"
    >
      {/* Layered backdrop */}
      <div aria-hidden className="absolute inset-0 bg-grid mask-fade-edges opacity-60" />
      <div aria-hidden className="absolute inset-0 bg-radial-fade" />
      <div
        aria-hidden
        className="absolute inset-x-0 -top-32 mx-auto h-[420px] max-w-[820px] rounded-full bg-accent/10 blur-[140px]"
      />

      <div className="relative mx-auto max-w-container px-6 pb-20 pt-36 lg:px-10 lg:pb-28 lg:pt-44">
        <Eyebrow className="mb-6">
          <span className="text-fg/70">// Unified League Management Engine</span>{" "}
          <span className="text-fg">· v1.0</span>
        </Eyebrow>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[18ch] font-sans text-[clamp(48px,9vw,128px)] font-semibold uppercase leading-[0.92] tracking-tighter text-balance text-fg"
        >
          The pulse of every league.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-[18px] leading-relaxed text-fg-muted"
        >
          We've built the unified engine for elite sports. We handle the
          logistics so you can handle the game.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <a
            href="#cta"
            className="group inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-widest text-bg transition-transform hover:scale-[1.02] active:scale-100"
          >
            Start Season
            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.25}
            />
          </a>
          <a
            href="#logistics"
            className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-1 px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
          >
            Explore Platform
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 lg:mt-24"
        >
          <DashboardStrip />
        </motion.div>
      </div>
    </section>
  );
}

function DashboardStrip() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <LiveGameCard />
      <RevenueCounterCard />
      <SchedulerCard />

      {/* Footer stats — full-width strip */}
      <div className="md:col-span-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          <StatCell label="Leagues Active" value="24" pulse />
          <StatCell label="Players" value="1,847" />
          <StatCell label="Conflicts Pending" value="0" tint="success" />
          <StatCell label="Uptime" value="99.98%" suffix="%-margin" />
        </div>
      </div>
    </div>
  );
}

function LiveGameCard() {
  // Animated tick-by-tick clock for the demo card.
  const [clock, setClock] = useState({ q: 3, mm: 18, ss: 42 });
  useEffect(() => {
    const t = setInterval(() => {
      setClock((c) => {
        let { q, mm, ss } = c;
        ss--;
        if (ss < 0) {
          ss = 59;
          mm--;
        }
        if (mm < 0) {
          mm = 11;
          q = Math.min(4, q + 1);
        }
        return { q, mm, ss };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-error">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-error" />
          </span>
          Live
        </div>
        <Activity className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      </div>
      <div className="mt-5 flex items-baseline gap-3 font-mono tabular-nums">
        <span className="text-3xl font-semibold tracking-tighter text-fg">CHI</span>
        <span className="text-fg-subtle">vs</span>
        <span className="text-3xl font-semibold tracking-tighter text-fg">BOS</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-fg-muted">
        <span className="font-mono tabular-nums">
          Q{clock.q} · {pad(clock.mm)}:{pad(clock.ss)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono">
          <Users className="h-3 w-3" strokeWidth={1.75} />
          1,204 attending
        </span>
      </div>
    </article>
  );
}

function RevenueCounterCard() {
  const target = 142340;
  const [v, setV] = useState(target - 6800);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        const start = performance.now();
        const begin = target - 6800;
        const dur = 2200;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          setV(Math.round(begin + (target - begin) * eased));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        observer.disconnect();
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <article ref={ref} className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Season Revenue
        </p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-success">
          +12% MoM
        </span>
      </div>
      <p className="mt-5 font-mono text-3xl font-semibold tabular-nums tracking-tighter text-fg">
        ${v.toLocaleString()}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "82%" }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="h-full bg-success"
        />
      </div>
      <p className="mt-2 text-[11px] text-fg-muted">
        82% of projected target collected · live
      </p>
    </article>
  );
}

function SchedulerCard() {
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Auto-Scheduler
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
          </span>
          AI optimizing
        </span>
      </div>
      <p className="mt-5 text-[13px] text-fg-muted">
        Season prep · <span className="text-fg">78%</span> complete
      </p>
      <div className="mt-3 grid grid-cols-12 gap-1">
        {Array.from({ length: 12 }).map((_, i) => {
          const filled = i < 9;
          return (
            <motion.div
              key={i}
              initial={{ scaleY: 0.4, opacity: 0.3 }}
              whileInView={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              viewport={{ once: true }}
              className={`h-6 origin-bottom rounded ${
                filled ? "bg-fg" : "bg-surface-2"
              }`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1 font-mono">
          <CalendarRange className="h-3 w-3" strokeWidth={1.75} />
          412 fixtures
        </span>
        <span className="inline-flex items-center gap-1 font-mono">
          <Wifi className="h-3 w-3" strokeWidth={1.75} />
          7 venues
        </span>
      </div>
    </article>
  );
}

function StatCell({
  label,
  value,
  pulse,
  tint,
  suffix
}: {
  label: string;
  value: string;
  pulse?: boolean;
  tint?: "success" | "cyan";
  suffix?: string;
}) {
  return (
    <div className="bg-surface-1 px-5 py-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className="mt-2 inline-flex items-baseline gap-1.5 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-fg">
        {pulse && (
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
        )}
        <span className={tint === "success" ? "text-success" : ""}>
          {value}
        </span>
      </p>
      {suffix ? null : null}
    </div>
  );
}
