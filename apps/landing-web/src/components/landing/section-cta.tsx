"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

export function SectionCta() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <section
      id="cta"
      className="relative overflow-hidden border-b border-border"
    >
      <div aria-hidden className="absolute inset-0 bg-grid mask-fade-edges opacity-50" />
      <div
        aria-hidden
        className="absolute inset-x-0 -top-20 mx-auto h-[280px] max-w-[700px] rounded-full bg-accent/10 blur-[120px]"
      />

      <div className="relative mx-auto max-w-container px-6 py-28 lg:px-10 lg:py-36">
        <Reveal>
          <Eyebrow>// Get Started</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="mt-5 max-w-[20ch] text-[clamp(48px,8vw,112px)] font-semibold uppercase leading-[0.94] tracking-tighter text-balance text-fg">
            Put your league on Pulse.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 font-mono text-[12px] uppercase tracking-widest text-fg-muted">
            // Join 24+ leagues already running on SportsPulse
          </p>
        </Reveal>

        <Reveal delay={0.16}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="mt-10 flex max-w-xl items-stretch gap-2 rounded-full border border-border-strong bg-surface-1 p-1.5 shadow-[0_0_0_4px_rgba(99,91,255,0.06)]"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@league.com"
              className="flex-1 bg-transparent px-4 py-2 text-[14px] text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              type="submit"
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-fg px-5 py-2 font-mono text-[12px] font-medium uppercase tracking-widest text-bg"
            >
              {submitted ? "Queued" : "Launch"}
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.25}
              />
            </motion.button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
