"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

type Kid = "ALL" | "LEO" | "AVA" | "SAM";

interface Event {
  kid: Exclude<Kid, "ALL">;
  sport: string;
  emoji: string;
  day: string;
  label: string;
  tint: string;
}

const EVENTS: Event[] = [
  // Mon
  { kid: "LEO", sport: "Soccer", emoji: "⚽", day: "Mon", label: "Practice · 5:00pm", tint: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { kid: "AVA", sport: "Gymnastics", emoji: "🤸", day: "Tue", label: "Meet · 9:00am", tint: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
  { kid: "SAM", sport: "Basketball", emoji: "🏀", day: "Wed", label: "Game · 7:30pm", tint: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { kid: "LEO", sport: "Soccer", emoji: "⚽", day: "Thu", label: "Game · 6:15pm", tint: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { kid: "AVA", sport: "Gymnastics", emoji: "🤸", day: "Fri", label: "Training · 4:30pm", tint: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
  { kid: "LEO", sport: "Soccer", emoji: "⚽", day: "Sat", label: "Playoff · 11:00am", tint: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { kid: "SAM", sport: "Basketball", emoji: "🏀", day: "Sat", label: "Practice · 3:00pm", tint: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { kid: "AVA", sport: "Gymnastics", emoji: "🤸", day: "Sun", label: "Showcase · 1:30pm", tint: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
  { kid: "SAM", sport: "Basketball", emoji: "🏀", day: "Sun", label: "Tournament · 4:00pm", tint: "bg-orange-500/15 text-orange-400 border-orange-500/30" }
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SectionFamily() {
  const [filter, setFilter] = useState<Kid>("ALL");

  const events =
    filter === "ALL" ? EVENTS : EVENTS.filter((e) => e.kid === filter);

  return (
    <Section id="families">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="order-2 lg:order-1 lg:col-span-7">
          <Reveal>
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-elev">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  Week of May 5, 2025
                </p>
                <div className="flex flex-wrap gap-1">
                  {(["ALL", "LEO", "AVA", "SAM"] as Kid[]).map((k) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setFilter(k)}
                      className={cn(
                        "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                        filter === k
                          ? "border-fg bg-fg text-bg"
                          : "border-border bg-surface-1 text-fg-muted hover:border-fg-muted hover:text-fg"
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day rail */}
              <div className="grid grid-cols-7 gap-px overflow-hidden border-b border-border bg-border">
                {DAYS.map((d) => (
                  <div
                    key={d}
                    className="bg-bg-elev px-3 py-2 text-center font-mono text-[10px] uppercase tracking-widest text-fg-muted"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div className="grid grid-cols-7 gap-px bg-border">
                {DAYS.map((d) => {
                  const dayEvents = events.filter((e) => e.day === d);
                  return (
                    <div
                      key={d}
                      className="min-h-[180px] space-y-1.5 bg-bg-elev px-1.5 py-2"
                    >
                      <AnimatePresence mode="popLayout">
                        {dayEvents.map((e, idx) => (
                          <motion.div
                            key={`${e.kid}-${e.day}-${idx}`}
                            layout
                            initial={{ opacity: 0, scale: 0.92, y: 6 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 6 }}
                            transition={{
                              duration: 0.32,
                              type: "spring",
                              stiffness: 240,
                              damping: 22
                            }}
                            className={cn(
                              "rounded-md border px-1.5 py-1.5 text-[10px] leading-tight",
                              e.tint
                            )}
                          >
                            <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide">
                              <span>{e.emoji}</span>
                              <span className="font-semibold">{e.kid}</span>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] opacity-90">
                              {e.label.split(" · ")[0]}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[9px] tabular-nums opacity-70">
                              {e.label.split(" · ")[1]}
                            </p>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                <span>3 athletes · 9 events · this week</span>
                <span className="text-success">All systems on time</span>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-5">
          <Reveal>
            <Eyebrow>// 04 · Family Hub</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-[clamp(36px,5vw,64px)] font-semibold leading-[1.04] tracking-tighter text-balance text-fg">
              One login. Every child.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
              Total clarity for the multi-athlete household. One unified view
              for every practice, game, and event across all your kids.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-7 max-w-md text-[14px] text-fg-subtle">
              Toggle any name above to filter the week. Add a coach, switch
              calendars, hand off pickup — your whole family on one timeline.
            </p>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
