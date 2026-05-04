"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";

const LINKS = [
  { href: "#logistics", label: "Logistics" },
  { href: "#sub-engine", label: "Sub-Engine" },
  { href: "#revenue", label: "Revenue" },
  { href: "#families", label: "Families" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#contact", label: "Contact" }
];

const SUPERADMIN = "https://sp-superadmin.vercel.app";
const LEAGUE_ADMIN = "https://sp-league-admin.vercel.app";

const ACCESS = [
  {
    title: "Super Admin",
    sub: "Federation, orgs, persons, audit",
    signIn: `${SUPERADMIN}/sign-in`,
    signUp: `${SUPERADMIN}/sign-up`
  },
  {
    title: "League Admin",
    sub: "One league: divisions, teams, games",
    signIn: `${LEAGUE_ADMIN}/sign-in`,
    signUp: `${LEAGUE_ADMIN}/sign-up`
  }
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const accessRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (!accessOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        accessRef.current &&
        !accessRef.current.contains(e.target as Node)
      ) {
        setAccessOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccessOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accessOpen]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-200",
        scrolled
          ? "border-b border-border bg-bg/80 backdrop-blur-md"
          : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-14 max-w-container items-center justify-between px-6 lg:px-10">
        <a href="#top" className="flex items-center">
          <Logo />
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Sign in dropdown — desktop */}
          <div ref={accessRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setAccessOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={accessOpen}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border bg-surface-1 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest transition-colors",
                accessOpen
                  ? "border-fg-muted text-fg"
                  : "border-border-strong text-fg-muted hover:border-fg-muted hover:text-fg"
              )}
            >
              Sign in
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  accessOpen && "rotate-180"
                )}
                strokeWidth={2.25}
              />
            </button>
            <AnimatePresence>
              {accessOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-xl border border-border bg-bg-elev shadow-xl shadow-black/40"
                  role="menu"
                >
                  <div className="border-b border-border px-4 py-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      // Choose your console
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {ACCESS.map((a) => (
                      <li key={a.title} className="px-4 py-3">
                        <p className="text-[13px] font-medium tracking-tight text-fg">
                          {a.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-fg-muted">
                          {a.sub}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <a
                            href={a.signIn}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setAccessOpen(false)}
                            className="group inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-bg transition-transform hover:scale-[1.03]"
                          >
                            Sign in
                            <ArrowUpRight
                              className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                              strokeWidth={2.25}
                            />
                          </a>
                          <a
                            href={a.signUp}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setAccessOpen(false)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-1 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
                          >
                            Sign up
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <a
            href="#cta"
            className="group hidden items-center gap-1.5 rounded-full border border-border-strong bg-fg px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-bg transition-all hover:scale-[1.02] active:scale-100 sm:inline-flex"
          >
            Start Season
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.25} />
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted hover:text-fg md:hidden"
            aria-label="Open menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-border bg-bg-subtle md:hidden"
          >
            <div className="mx-auto flex max-w-container flex-col gap-1 px-6 py-4">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2 font-mono text-[12px] uppercase tracking-widest text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  {l.label}
                </a>
              ))}

              <div className="mt-3 border-t border-border pt-3">
                <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
                  // Sign in / Sign up
                </p>
                {ACCESS.map((a) => (
                  <div key={a.title} className="px-3 py-2">
                    <p className="text-[13px] font-medium text-fg">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fg-muted">{a.sub}</p>
                    <div className="mt-2 flex gap-2">
                      <a
                        href={a.signIn}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-bg"
                      >
                        Sign in
                        <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.25} />
                      </a>
                      <a
                        href={a.signUp}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-1 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-fg-muted"
                      >
                        Sign up
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              <a
                href="#cta"
                onClick={() => setOpen(false)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-widest text-bg"
              >
                Start Season
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
