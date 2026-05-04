"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
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

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

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
              <a
                href="#cta"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-widest text-bg"
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
