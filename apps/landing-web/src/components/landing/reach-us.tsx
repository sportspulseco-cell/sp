"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, MapPin, Phone, Mail, Send } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

export function ReachUs() {
  return (
    <section className="relative w-full overflow-hidden border-b border-border navy-radial">
      <div aria-hidden className="absolute inset-0 bg-grid opacity-30" />
      <div className="relative mx-auto max-w-container px-6 py-32 lg:px-10">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-20">
          <div>
            <Reveal>
              <Eyebrow>// Reach Us</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 text-[clamp(40px,6vw,84px)] font-semibold uppercase leading-[0.94] tracking-tighter text-balance text-fg">
                Reach
                <br />
                <span className="text-electric">the Hub.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-md text-[16px] leading-relaxed text-fg-muted">
                Two ways in. Drop the form for new leagues and partnerships,
                or wire us directly — the address, line, and inbox below
                reach the same engineering team that runs the platform.
              </p>
            </Reveal>

            <Reveal delay={0.16}>
              <ul className="mt-10 space-y-6">
                <DetailRow
                  icon={<MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  label="Address"
                  value="464, COMMON STREET, BELMONT, MA 02478"
                />
                <DetailRow
                  icon={<Phone className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  label="Phone"
                  value="+1 669-309-7426"
                  href="tel:+16693097426"
                />
                <DetailRow
                  icon={<Mail className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  label="Email"
                  value="INFO@SPORTSPULSE.US"
                  href="mailto:info@sportspulse.us"
                />
              </ul>
            </Reveal>

            <Reveal delay={0.22}>
              <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3.5 py-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-success">
                  Systems Operational · One business day SLA
                </span>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal delay={0.05}>
              <LaunchForm />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
  href
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <div className="flex items-start gap-4">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-electric/30 bg-electric/5 text-electric">
        {icon}
      </span>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          // {label}
        </p>
        <p className="mt-1 font-mono text-[14px] tracking-wide text-fg">
          {value}
        </p>
      </div>
    </div>
  );
  if (href) {
    return (
      <li>
        <a href={href} className="block transition-colors hover:text-electric">
          {body}
        </a>
      </li>
    );
  }
  return <li>{body}</li>;
}

function LaunchForm() {
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="glass relative overflow-hidden rounded-3xl p-7 sm:p-9"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Open a channel
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-electric">
          <span className="h-1.5 w-1.5 rounded-full bg-electric animate-pulse" />
          Live receiver
        </span>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Name" id="r-name" placeholder="Coach Maya" />
        <Field label="Organization" id="r-org" placeholder="Belmont Hockey League" />
      </div>
      <div className="mt-5">
        <Field label="Email" id="r-email" placeholder="you@league.com" type="email" />
      </div>
      <div className="mt-5">
        <Field
          label="Mission"
          id="r-mission"
          placeholder="Tell us about the league you want to put on Pulse…"
          textarea
        />
      </div>

      <div className="mt-7 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          We never share your info. PGP available on request.
        </p>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 380, damping: 14 }}
          type="submit"
          className="group inline-flex items-center gap-2 rounded-full bg-electric px-6 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-widest text-navy shadow-electric"
          style={{
            boxShadow:
              "0 0 0 1px rgba(0, 242, 255, 0.5), 0 0 28px -2px rgba(0, 242, 255, 0.7), 0 0 64px -12px rgba(0, 242, 255, 0.45)"
          }}
        >
          {sent ? (
            <>
              Launched
              <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
            </>
          ) : (
            <>
              Launch
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.5}
              />
            </>
          )}
        </motion.button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  placeholder,
  textarea = false,
  type = "text"
}: {
  label: string;
  id: string;
  placeholder?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-widest text-fg-muted"
      >
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          name={id}
          rows={4}
          placeholder={placeholder}
          className="mt-2 w-full resize-none rounded-md border border-border bg-bg/60 px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-subtle focus:border-electric/60 focus:outline-none focus:ring-2 focus:ring-electric/20"
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          placeholder={placeholder}
          className="mt-2 w-full rounded-md border border-border bg-bg/60 px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-subtle focus:border-electric/60 focus:outline-none focus:ring-2 focus:ring-electric/20"
        />
      )}
    </div>
  );
}
