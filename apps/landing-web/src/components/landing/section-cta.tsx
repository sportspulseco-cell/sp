"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Building2,
  ShieldCheck,
  User,
  UsersRound
} from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

const SUPERADMIN = "https://sp-superadmin.vercel.app";
const ORG_ADMIN = "https://sp-org-admin.vercel.app";
const TEAM_ADMIN = "https://sp-team-admin.vercel.app";
// sp-player.vercel.app was held externally — Vercel auto-assigned -red.
const PLAYER = "https://sp-player-red.vercel.app";
// League-admin sign-in landing collapsed into superadmin-web with a
// league-scoped role filter (P5-D, 2026-05-15).

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

        {/* Already running a league? — direct console access. Five
            role-targeted apps each have their own sign-in landing per
            repo owner directive 2026-05-09. */}
        <Reveal delay={0.22}>
          <div className="mt-14 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ConsoleCard
              icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.25} />}
              title="Super Admin"
              sub="Federation, orgs, persons, audit"
              signIn={`${SUPERADMIN}/sign-in`}
              signUp={`${SUPERADMIN}/sign-up`}
            />
            <ConsoleCard
              icon={<Building2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
              title="Org Admin"
              sub="One organization: leagues, seasons, billing"
              signIn={`${ORG_ADMIN}/sign-in`}
              signUp={`${ORG_ADMIN}/sign-up`}
            />
            <ConsoleCard
              icon={<UsersRound className="h-3.5 w-3.5" strokeWidth={2.25} />}
              title="Team Admin / Coach"
              sub="Roster, lineups, team comms"
              signIn={`${TEAM_ADMIN}/sign-in`}
              signUp={`${TEAM_ADMIN}/sign-up`}
            />
            <ConsoleCard
              icon={<User className="h-3.5 w-3.5" strokeWidth={2.25} />}
              title="Player / Free Agent"
              sub="Register, sign waivers, find a team"
              signIn={`${PLAYER}/sign-in`}
              signUp={`${PLAYER}/sign-up`}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ConsoleCard({
  icon,
  title,
  sub,
  signIn,
  signUp
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  signIn: string;
  signUp: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-surface-1 p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg-elev text-cyan">
          {icon}
        </span>
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          {title}
        </p>
      </div>
      <p className="mt-2 text-[12px] text-fg-muted">{sub}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={signIn}
          target="_blank"
          rel="noreferrer"
          className="group/btn inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-widest text-bg transition-transform hover:scale-[1.03]"
        >
          Sign in
          <ArrowUpRight
            className="h-3 w-3 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
            strokeWidth={2.25}
          />
        </a>
        <a
          href={signUp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg-elev px-3.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
        >
          Sign up
        </a>
      </div>
    </motion.div>
  );
}
