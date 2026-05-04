"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

const BULLETS = [
  "98% automated collection rate",
  "Stripe, PayPal & ACH supported",
  "Split-payment plans per player"
];

const PLAYERS = ["AR", "BK", "CL", "DM", "EP", "FQ", "GR", "HS", "IT", "JU"];

export function SectionRevenue() {
  return (
    <Section id="revenue">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>// 03 · Revenue Engine</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-[clamp(36px,5vw,64px)] font-semibold leading-[1.04] tracking-tighter text-balance text-fg">
              We secure your revenue.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
              Automated collection, real-time QuickBooks sync, and flexible
              split payments ensure your league never chases a dollar.
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
          <div className="grid gap-4">
            <Reveal delay={0.05}>
              <CollectionMeter />
            </Reveal>
            <Reveal delay={0.12}>
              <div className="grid gap-4 md:grid-cols-2">
                <QuickbooksSync />
                <SplitPayment />
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </Section>
  );
}

function CollectionMeter() {
  const target = 142340;
  const projected = 145000;
  const pct = Math.round((target / projected) * 100);
  const [v, setV] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const dur = 2200;
    const id = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-elev p-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Real-Time Collection
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-success">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>
      <p className="mt-5 font-mono text-[44px] font-semibold leading-none tabular-nums tracking-tighter text-fg">
        ${v.toLocaleString()}
      </p>
      <div className="mt-4 flex items-center justify-between text-[11px] text-fg-muted">
        <span>{pct}% of projected target</span>
        <span className="font-mono tabular-nums">$142,340 / $145,000</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="h-full bg-gradient-to-r from-success to-cyan"
        />
      </div>
    </div>
  );
}

function QuickbooksSync() {
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSynced(true), 900);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        QuickBooks Live Sync
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="relative inline-flex h-2.5 w-2.5">
          {synced && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              synced ? "bg-success" : "bg-warning"
            }`}
          />
        </span>
        <p className="font-mono text-[13px] font-medium tabular-nums text-fg">
          {synced ? "↑ $142,340 SYNCED" : "Syncing…"}
        </p>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
        <RefreshCw
          className={`h-3 w-3 ${synced ? "" : "animate-spin"}`}
          strokeWidth={1.75}
        />
        Last sync · {synced ? "just now" : "in flight"}
      </p>
    </div>
  );
}

function SplitPayment() {
  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Split-Payment Invoice
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-12 w-20 items-center justify-center rounded-md border border-border-strong bg-surface-1 font-mono text-[13px] font-semibold tabular-nums text-fg">
          $1,200
        </div>
        <div className="flex flex-1 items-center">
          <svg className="h-2 w-full" viewBox="0 0 100 8" preserveAspectRatio="none">
            <path
              d="M2 4 H98"
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          </svg>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-5 gap-2">
        {PLAYERS.map((p, i) => (
          <motion.li
            key={p}
            initial={{ opacity: 0, scale: 0.6, y: 6 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: i * 0.06,
              type: "spring",
              stiffness: 220,
              damping: 18
            }}
            viewport={{ once: true, margin: "-40px" }}
            className="flex flex-col items-center"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] font-semibold tracking-wide text-fg">
              {p}
            </span>
            <span className="mt-1 font-mono text-[9px] tabular-nums text-fg-muted">
              $120
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
