"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Mic2,
  BookOpen,
  HelpCircle,
  Rss,
  Wrench,
  GraduationCap
} from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

interface ResourceItem {
  title: string;
  sub: string;
  href: string;
  icon: React.ReactNode;
}

const ITEMS: ResourceItem[] = [
  {
    title: "Training",
    sub: "Onboarding videos, walkthroughs, certification",
    href: "#training",
    icon: <GraduationCap className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Tech Support",
    sub: "Engineering response within one business day",
    href: "#support",
    icon: <Wrench className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "FAQ",
    sub: "The hundred questions every league asks first",
    href: "#faq",
    icon: <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Updates",
    sub: "Changelog, releases, post-mortems",
    href: "#updates",
    icon: <Rss className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Blog",
    sub: "Field notes on autonomous sports infrastructure",
    href: "#blog",
    icon: <BookOpen className="h-4 w-4" strokeWidth={1.75} />
  }
];

export function ResourcesHub() {
  return (
    <section className="relative w-full overflow-hidden border-b border-border navy-radial">
      <div aria-hidden className="absolute inset-0 bg-grid opacity-30" />
      <div className="relative mx-auto max-w-container px-6 py-32 lg:px-10">
        <div className="grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <Eyebrow>// Knowledge Hub</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 text-[clamp(40px,6vw,80px)] font-semibold uppercase leading-[0.96] tracking-tighter text-balance text-fg">
                The pulse, <span className="text-electric">decoded.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
                A living archive — broadcasts, walkthroughs, post-mortems, and
                the long-form field notes from the teams running the league
                infrastructure of the next decade.
              </p>
            </Reveal>
          </div>

          <div id="podcast" className="lg:col-span-7">
            <Reveal delay={0.08}>
              <PodcastCard />
            </Reveal>
          </div>
        </div>

        <div id="hub" className="mt-24 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <Eyebrow>// 02 · Resources</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 text-[clamp(32px,4vw,56px)] font-semibold leading-[1.04] tracking-tighter text-balance text-fg">
                Everything you need
                <br />
                to run a season.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
                Each link below opens a dedicated surface, maintained by the
                same engineering org that ships the platform.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-7">
            <KineticList items={ITEMS} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PodcastCard() {
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-8 sm:p-10">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full border border-electric/40 bg-electric/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-electric">
          <Mic2 className="h-3 w-3" strokeWidth={2.25} />
          The SportsPulse Podcast
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted animate-electric-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-electric" />
          Coming Soon
        </span>
      </div>

      <h3 className="mt-6 text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.05] tracking-tighter text-fg">
        Decoding the Game.
      </h3>
      <p className="mt-4 max-w-prose text-[14.5px] leading-relaxed text-fg-muted">
        Join us for interactions with global sports tech leaders. We explore
        the intersection of human performance and autonomous logistics. From
        the tech stack of champions to the business of global scale, we go
        beyond the box score to interview the pioneers redefining athletics.
      </p>

      <div className="mt-7">
        <Waveform />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="group inline-flex items-center gap-2 rounded-full bg-electric px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-navy shadow-electric transition-transform hover:scale-[1.02]"
        >
          Notify me on launch
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.25}
          />
        </button>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          Episode 01 · Q3 2026 · Hosted from Belmont, MA
        </span>
      </div>
    </div>
  );
}

/**
 * Animated audio waveform — 48 bars, each animating heightWise on a
 * staggered sine schedule. Renders only client-side after mount to avoid
 * SSR/CSR mismatch from Math.random.
 */
function Waveform() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-20 w-full rounded-md bg-bg/40" aria-hidden />;
  }

  const bars = 56;
  return (
    <div className="relative flex h-20 items-end gap-[3px] rounded-md bg-bg/40 px-3 py-2">
      {Array.from({ length: bars }).map((_, i) => {
        const base = 0.18 + Math.abs(Math.sin(i * 0.42)) * 0.4;
        return (
          <motion.span
            key={i}
            initial={{ scaleY: 0.2 }}
            animate={{
              scaleY: [base, base + 0.5, base + 0.1, base + 0.7, base]
            }}
            transition={{
              duration: 1.8 + (i % 7) * 0.12,
              repeat: Infinity,
              ease: "easeInOut",
              delay: (i % 11) * 0.06
            }}
            style={{ transformOrigin: "bottom" }}
            className="block w-[3px] flex-1 rounded-[1px] bg-electric/70"
          />
        );
      })}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(0, 27, 58, 0.55) 100%)"
        }}
      />
    </div>
  );
}

function KineticList({ items }: { items: ResourceItem[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-elev">
      {items.map((it, i) => (
        <motion.li
          key={it.title}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, margin: "-40px" }}
        >
          <motion.a
            href={it.href}
            whileHover="hover"
            initial="rest"
            animate="rest"
            className="group flex items-center gap-5 px-6 py-5"
          >
            <motion.span
              variants={{ rest: { x: 0 }, hover: { x: 20 } }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="flex items-center gap-5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg/60 text-electric">
                {it.icon}
              </span>
              <div>
                <p className="text-[15px] font-semibold tracking-tight text-fg transition-colors group-hover:text-electric">
                  {it.title}
                </p>
                <p className="mt-0.5 text-[12px] text-fg-muted">{it.sub}</p>
              </div>
            </motion.span>
            <motion.span
              variants={{
                rest: { opacity: 0, x: -8 },
                hover: { opacity: 1, x: 0 }
              }}
              transition={{ duration: 0.2 }}
              className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-electric"
            >
              Open
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            </motion.span>
          </motion.a>
        </motion.li>
      ))}
    </ul>
  );
}
