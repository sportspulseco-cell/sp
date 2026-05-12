"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  secondaryRole?: string;
  bio: string;
  initials: string;
  accent: "indigo" | "cyan" | "violet" | "amber" | "rose";
}

const TEAM: TeamMember[] = [
  {
    id: "teja",
    name: "Teja Reddy",
    role: "CEO",
    bio: "Architects the long-arc product vision and capital strategy. Splits time between the Belmont studio and the field, where every product decision gets tested against the ground truth of an in-flight league.",
    initials: "TR",
    accent: "cyan"
  },
  {
    id: "thangaraj",
    name: "V. Thangaraj",
    role: "Tech Team",
    bio: "Owns the platform's structural integrity — schema, scheduling kernel, audit. Twenty years of building backbone infrastructure that has to be right the first time.",
    initials: "VT",
    accent: "indigo"
  },
  {
    id: "azmath",
    name: "Azmath Sharief",
    role: "CTO",
    bio: "Engineering org and the autonomous logistics core. Designs the systems that decide — substitutions, conflict resolution, predictive optimization — and the guardrails that keep them honest.",
    initials: "AS",
    accent: "violet"
  },
  {
    id: "johnny",
    name: "Dr. Johnny Kula",
    role: "Operations",
    secondaryRole: "CFO · PPHL",
    bio: "Translates league operations from spreadsheet chaos into deterministic process. Brings the operational discipline of a top-tier professional hockey league directly into the product spec.",
    initials: "JK",
    accent: "amber"
  },
  {
    id: "shawn",
    name: "Shawn Connors",
    role: "Sales & Marketing",
    secondaryRole: "CEO · PPHL",
    bio: "Carries the conversation with the leagues and federations who will run on SportsPulse. Knows the seasons, the unit economics, and the audience behind every roster line.",
    initials: "SC",
    accent: "rose"
  }
];

const ACCENT: Record<TeamMember["accent"], string> = {
  cyan: "from-electric/30 via-electric/10 to-transparent",
  indigo: "from-indigo-500/30 via-indigo-500/10 to-transparent",
  violet: "from-violet-500/30 via-violet-500/10 to-transparent",
  amber: "from-amber-400/30 via-amber-400/10 to-transparent",
  rose: "from-rose-500/30 via-rose-500/10 to-transparent"
};

export function Leadership() {
  return (
    <section className="relative w-full overflow-hidden border-b border-border navy-radial">
      <div aria-hidden className="absolute inset-0 bg-grid opacity-30" />
      <div className="relative mx-auto max-w-container px-6 py-32 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <Eyebrow>// The Architects</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 text-[clamp(40px,6vw,80px)] font-semibold uppercase leading-[0.96] tracking-tighter text-balance text-fg">
                The leadership <span className="text-electric">unit.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
                A collective of athletes and pioneers based in Belmont, MA. We
                don't just build software; we engineer the competitive edge
                for the next generation of professional sports.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3.5 py-1.5">
                <MapPin className="h-3.5 w-3.5 text-electric" strokeWidth={1.75} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-electric">
                  Belmont, MA · United States
                </span>
              </div>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <ol className="space-y-5">
              {TEAM.map((m, i) => (
                <Reveal key={m.id} delay={0.08 + i * 0.06}>
                  <MemberCard member={m} index={i + 1} />
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function MemberCard({ member, index }: { member: TeamMember; index: number }) {
  return (
    <motion.li
      whileHover={{ x: 4 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-bg-elev"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-1/4 -top-1/4 h-[140%] w-1/2 rotate-12 bg-gradient-to-br ${ACCENT[member.accent]} blur-3xl opacity-60 transition-opacity duration-500 group-hover:opacity-100`}
      />

      <div className="relative grid grid-cols-1 sm:grid-cols-[160px_1fr] lg:grid-cols-[180px_1fr]">
        <Headshot member={member} />
        <div className="flex flex-col justify-center gap-2 p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
              0{index}
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-electric">
              {member.role}
            </span>
          </div>
          <h3 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">
            {member.name}
          </h3>
          {member.secondaryRole && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {member.secondaryRole}
            </p>
          )}
          <p className="mt-1 max-w-prose text-[13.5px] leading-relaxed text-fg-muted">
            {member.bio}
          </p>
        </div>
      </div>
    </motion.li>
  );
}

function Headshot({ member }: { member: TeamMember }) {
  return (
    <div className="scanline relative aspect-square w-full overflow-hidden border-b border-border bg-gradient-to-br from-navy via-navy-deep to-black sm:border-b-0 sm:border-r">
      {/* Faux portrait — initials over a constellation of subtle dots */}
      <div aria-hidden className="absolute inset-0 opacity-50">
        <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 40 }).map((_, i) => {
            const x = (i * 37) % 100;
            const y = (i * 19) % 100;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={0.4}
                fill="rgba(0, 242, 255, 0.4)"
              />
            );
          })}
        </svg>
      </div>

      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0, 242, 255, 0.18) 0%, transparent 60%)"
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[44px] font-semibold tracking-tighter text-electric drop-shadow-[0_0_18px_rgba(0,242,255,0.5)]">
          {member.initials}
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-fg-subtle">
        <span>// PORTRAIT.{member.id.toUpperCase()}</span>
        <span className="text-electric">LIVE</span>
      </div>
    </div>
  );
}
