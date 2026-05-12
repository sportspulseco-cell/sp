"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Check, Sparkles, Zap, Crown } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

export interface PricingTier {
  id: "starter" | "pro" | "enterprise";
  name: string;
  tagline: string;
  monthly: number;
  description: string;
  features: string[];
  emphasis: boolean;
  badge?: string;
  icon: React.ReactNode;
}

const TIERS: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "The Foundation.",
    monthly: 29,
    description:
      "Perfect for independent leagues digitizing their first season. Get off the spreadsheet and into a unified engine that automates player registration and basic scheduling.",
    features: [
      "Player registration funnel",
      "Basic autonomous scheduling",
      "One organization · one league",
      "Email + parent notifications",
      "Standard support (48h)"
    ],
    emphasis: false,
    icon: <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The Growth Engine.",
    monthly: 59,
    description:
      "Our most utilized tier. Unlock the Sub-Engine, QuickBooks integration, and the multi-athlete Family Hub to maximize parent satisfaction and revenue collection.",
    features: [
      "Everything in Starter",
      "Sub-Engine + Referee module",
      "QuickBooks live sync",
      "Multi-athlete Family Hub",
      "Multi-league scheduling",
      "Priority support (12h)"
    ],
    emphasis: true,
    badge: "Most utilized",
    icon: <Zap className="h-3.5 w-3.5" strokeWidth={2} />
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "The Elite Scale.",
    monthly: 199,
    description:
      "Architected for global complexes. Includes custom compliance workflows, multi-region database support, and priority 24/7 technical engineering access.",
    features: [
      "Everything in Pro",
      "Custom compliance workflows",
      "Multi-region database",
      "Custom SSO + audit export",
      "Dedicated engineering pod",
      "24/7 priority access"
    ],
    emphasis: false,
    icon: <Crown className="h-3.5 w-3.5" strokeWidth={2} />
  }
];

type Cycle = "monthly" | "yearly";

export function PricingTiers() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <section className="relative w-full overflow-hidden border-b border-border navy-radial">
      <div aria-hidden className="absolute inset-0 bg-grid opacity-30" />
      <div className="relative mx-auto max-w-container px-6 py-32 lg:px-10">
        <div className="text-center">
          <Reveal>
            <Eyebrow>// Revenue Engine · Pricing</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mx-auto mt-5 max-w-[20ch] text-[clamp(40px,6vw,80px)] font-semibold uppercase leading-[0.96] tracking-tighter text-balance text-fg">
              One engine. <span className="text-electric">Three scales.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-fg-muted">
              Geometric pillars, not tiers. Pick the foundation you need today
              and ramp into elite scale without re-architecting your league.
            </p>
          </Reveal>

          <Reveal delay={0.16}>
            <CycleToggle cycle={cycle} onChange={setCycle} />
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {TIERS.map((t, i) => (
            <Reveal key={t.id} delay={0.08 + i * 0.06}>
              <TierCard tier={t} cycle={cycle} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.4}>
          <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
            // All prices in USD · per organization · cancel anytime
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function CycleToggle({
  cycle,
  onChange
}: {
  cycle: Cycle;
  onChange: (c: Cycle) => void;
}) {
  return (
    <div className="mt-10 inline-flex items-center gap-3">
      <div className="relative inline-flex items-center rounded-full border border-border-strong bg-surface-1 p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-electric/15 shadow-electric transition-all duration-300"
          style={{
            width: "calc(50% - 4px)",
            left: cycle === "monthly" ? "4px" : "calc(50%)"
          }}
        />
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`relative z-10 inline-flex items-center gap-1.5 rounded-full px-5 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
              cycle === c ? "text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {c}
            {c === "yearly" && (
              <span className="rounded-full bg-electric/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-electric">
                -20%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function TierCard({ tier, cycle }: { tier: PricingTier; cycle: Cycle }) {
  const yearlyMonthly = Math.round(tier.monthly * 0.8);
  const displayPrice = cycle === "monthly" ? tier.monthly : yearlyMonthly;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border p-7 ${
        tier.emphasis
          ? "glass-strong border-electric/40 shadow-electric"
          : "border-border bg-bg-elev"
      }`}
    >
      {tier.emphasis && (
        <div
          aria-hidden
          className="absolute -inset-px rounded-2xl opacity-60"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,242,255,0.18) 0%, transparent 40%, transparent 60%, rgba(0,242,255,0.12) 100%)",
            mask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
            WebkitMask:
              "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: 1
          }}
        />
      )}

      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <span className="text-electric">{tier.icon}</span>
          {tier.name}
        </span>
        {tier.badge && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-electric/40 bg-electric/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-electric animate-electric-pulse">
            {tier.badge}
          </span>
        )}
      </div>

      <p className="relative mt-5 text-[14px] font-medium tracking-tight text-fg-muted">
        {tier.tagline}
      </p>

      <div className="relative mt-3 flex items-end gap-2">
        <span className="font-mono text-[14px] text-fg-muted">$</span>
        <Odometer value={displayPrice} />
        <span className="mb-2 font-mono text-[12px] uppercase tracking-widest text-fg-muted">
          / mo
        </span>
      </div>
      <AnimatePresence mode="wait">
        {cycle === "yearly" ? (
          <motion.p
            key="yearly"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="relative mt-1 font-mono text-[10px] uppercase tracking-widest text-electric"
          >
            ${tier.monthly * 12 * 0.8}/yr · billed annually
          </motion.p>
        ) : (
          <motion.p
            key="monthly"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="relative mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-subtle"
          >
            ${tier.monthly}/mo · billed monthly
          </motion.p>
        )}
      </AnimatePresence>

      <p className="relative mt-5 text-[13px] leading-relaxed text-fg-muted">
        {tier.description}
      </p>

      <ul className="relative mt-6 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13px] text-fg">
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${tier.emphasis ? "text-electric" : "text-cyan"}`}
              strokeWidth={2.25}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-auto pt-8">
        <a
          href="#cta"
          className={`group/btn inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-widest transition-transform hover:scale-[1.02] ${
            tier.emphasis
              ? "bg-electric text-navy shadow-electric"
              : "border border-border-strong bg-surface-1 text-fg hover:border-fg-muted"
          }`}
        >
          {tier.id === "enterprise" ? "Talk to engineering" : "Start " + tier.name}
          <ArrowUpRight
            className="h-3 w-3 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
            strokeWidth={2.25}
          />
        </a>
      </div>
    </motion.div>
  );
}

/**
 * Odometer roll — splits the digits and animates each one independently
 * vertically when the value changes. Uses framer-motion springs.
 */
function Odometer({ value }: { value: number }) {
  const digits = String(value).split("");
  return (
    <span className="inline-flex items-end font-mono text-[64px] font-semibold leading-none tabular-nums tracking-tighter text-fg">
      {digits.map((d, i) => (
        <Digit key={`${digits.length}-${i}`} digit={d} index={i} />
      ))}
    </span>
  );
}

function Digit({ digit, index }: { digit: string; index: number }) {
  const [current, setCurrent] = useState(digit);
  useEffect(() => {
    if (digit !== current) {
      const t = setTimeout(() => setCurrent(digit), 60 + index * 40);
      return () => clearTimeout(t);
    }
  }, [digit, current, index]);

  return (
    <span className="relative inline-block h-[1em] w-[0.6em] overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={current}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="absolute inset-0 flex items-end justify-center"
        >
          {current}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
