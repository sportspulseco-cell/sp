"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, MapPin, Phone, Mail, Globe } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

export function SectionContact() {
  return (
    <Section id="contact">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>// 06 · Contact the Hub</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-[clamp(36px,5vw,72px)] font-semibold uppercase leading-[0.96] tracking-tighter text-balance text-fg">
              Contact
              <br /> the Hub.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-fg-muted">
              Reach our infrastructure team directly. We respond within one
              business day.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <ul className="mt-7 space-y-3">
              <ContactRow icon={<MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />}>
                464 Common Street, Belmont, MA 02478, United States
              </ContactRow>
              <ContactRow icon={<Phone className="h-3.5 w-3.5" strokeWidth={1.75} />}>
                +1 669-309-7426
              </ContactRow>
              <ContactRow icon={<Mail className="h-3.5 w-3.5" strokeWidth={1.75} />}>
                INFO@SPORTSPULSE.IO
              </ContactRow>
              <ContactRow icon={<Globe className="h-3.5 w-3.5" strokeWidth={1.75} />}>
                Belmont, MA · Boston · Dubai · Singapore · EN-AR-HI
              </ContactRow>
            </ul>
          </Reveal>
          <Reveal delay={0.22}>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-success">
                Systems Operational · All Nodes Live
              </span>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={0.05}>
            <ContactForm />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

function ContactRow({
  icon,
  children
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted">
        {icon}
      </span>
      <span className="font-mono text-[12px] tracking-wide text-fg">
        {children}
      </span>
    </li>
  );
}

function ContactForm() {
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="overflow-hidden rounded-2xl border border-border bg-bg-elev p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" id="name" placeholder="Coach Maya" />
        <Field label="Subject" id="subject" placeholder="New league inquiry" />
      </div>
      <div className="mt-5">
        <Field
          label="Message"
          id="message"
          placeholder="Tell us about your league…"
          textarea
        />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          We never share your info. PGP available on request.
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          type="submit"
          className="group inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-widest text-bg"
        >
          {sent ? "Message sent" : "Send Message"}
          <ArrowUpRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.25}
          />
        </motion.button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  placeholder,
  textarea = false
}: {
  label: string;
  id: string;
  placeholder?: string;
  textarea?: boolean;
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
          className="mt-2 w-full resize-none rounded-md border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-subtle focus:border-fg-muted focus:outline-none"
        />
      ) : (
        <input
          id={id}
          name={id}
          type="text"
          placeholder={placeholder}
          className="mt-2 w-full rounded-md border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-subtle focus:border-fg-muted focus:outline-none"
        />
      )}
    </div>
  );
}
