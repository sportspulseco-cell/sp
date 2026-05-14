"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Layers,
  Wallet,
  Users,
  Mic2,
  BookOpen,
  MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";

type MegaItem = {
  title: string;
  sub: string;
  href: string;
  icon: React.ReactNode;
};

const PRODUCTS: MegaItem[] = [
  {
    title: "Autonomous Logistics",
    sub: "Self-healing schedule + venue + weather engine",
    href: "/#logistics",
    icon: <Layers className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Sub-Engine & Referee",
    sub: "Fill gaps in < 5 seconds with verified officials",
    href: "/#sub-engine",
    icon: <Sparkles className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Revenue Engine",
    sub: "Family Hub, QuickBooks, multi-athlete invoicing",
    href: "/pricing",
    icon: <Wallet className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Intelligence Layer",
    sub: "Predictive standings · player performance",
    href: "/#intelligence",
    icon: <Sparkles className="h-4 w-4" strokeWidth={1.75} />
  }
];

const INFORMATION: MegaItem[] = [
  {
    title: "The Architects",
    sub: "Leadership · Belmont, MA",
    href: "/leadership",
    icon: <Users className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Podcast",
    sub: "Decoding the Game · coming soon",
    href: "/resources#podcast",
    icon: <Mic2 className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Knowledge Hub",
    sub: "Training · FAQ · Updates · Blog",
    href: "/resources",
    icon: <BookOpen className="h-4 w-4" strokeWidth={1.75} />
  },
  {
    title: "Reach Us",
    sub: "464 Common St · Belmont, MA",
    href: "/contact",
    icon: <MapPin className="h-4 w-4" strokeWidth={1.75} />
  }
];

const PRIMARY = [
  { href: "/pricing", label: "Pricing" },
  { href: "/leadership", label: "Leadership" },
  { href: "/resources", label: "Resources" },
  { href: "/contact", label: "Contact" }
];

const SUPERADMIN = "https://sp-superadmin.vercel.app";
const ORG_ADMIN = "https://sp-org-admin.vercel.app";
const TEAM_ADMIN = "https://sp-team-admin.vercel.app";
const PLAYER = "https://sp-player-red.vercel.app";

// League-admin surfaces collapsed into superadmin-web with a
// league-scoped role filter — P5-D decision (2026-05-15). The
// dedicated app is gone; league admins sign in to superadmin-web
// and see a filtered view.
const ACCESS = [
  { title: "Super Admin", sub: "Federation, orgs, persons, audit", base: SUPERADMIN },
  { title: "Org Admin", sub: "One organization: leagues, seasons, billing", base: ORG_ADMIN },
  { title: "Team Admin / Coach", sub: "Roster, lineups, team comms", base: TEAM_ADMIN },
  { title: "Player / Free Agent", sub: "Register, sign waivers, find a team", base: PLAYER }
];

type MenuKey = "products" | "information" | "signin" | null;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (menu === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menu]);

  const openMenu = (k: MenuKey) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setMenu(k);
  };
  const scheduleClose = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setMenu(null), 120);
  };

  return (
    <header
      ref={wrapRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-200",
        scrolled || menu !== null
          ? "border-b border-border bg-bg/80 backdrop-blur-md"
          : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-14 max-w-container items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center" onClick={() => setMenu(null)}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <MegaTrigger
            label="Products"
            active={menu === "products"}
            onEnter={() => openMenu("products")}
            onLeave={scheduleClose}
            onClick={() => setMenu(menu === "products" ? null : "products")}
          />
          <MegaTrigger
            label="Information"
            active={menu === "information"}
            onEnter={() => openMenu("information")}
            onLeave={scheduleClose}
            onClick={() => setMenu(menu === "information" ? null : "information")}
          />
          {PRIMARY.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setMenu(menu === "signin" ? null : "signin")}
              aria-haspopup="menu"
              aria-expanded={menu === "signin"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border bg-surface-1 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest transition-colors",
                menu === "signin"
                  ? "border-electric/60 text-fg shadow-[0_0_18px_-6px_rgba(0,242,255,0.6)]"
                  : "border-border-strong text-fg-muted hover:border-fg-muted hover:text-fg"
              )}
            >
              Sign in
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  menu === "signin" && "rotate-180"
                )}
                strokeWidth={2.25}
              />
            </button>
          </div>

          <Link
            href="/pricing"
            className="group hidden items-center gap-1.5 rounded-full border border-electric/30 bg-fg px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-bg transition-all hover:scale-[1.02] hover:shadow-[0_0_26px_-6px_rgba(0,242,255,0.7)] active:scale-100 sm:inline-flex"
          >
            Start Season
            <ArrowUpRight
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.25}
            />
          </Link>
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

      {/* Mega menu — full-width glassmorphic */}
      <AnimatePresence>
        {menu === "products" && (
          <MegaPanel key="products" items={PRODUCTS} onClose={() => setMenu(null)} onEnter={() => openMenu("products")} onLeave={scheduleClose} />
        )}
        {menu === "information" && (
          <MegaPanel key="info" items={INFORMATION} onClose={() => setMenu(null)} onEnter={() => openMenu("information")} onLeave={scheduleClose} />
        )}
        {menu === "signin" && (
          <SignInPanel onClose={() => setMenu(null)} />
        )}
      </AnimatePresence>

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
              <MobileGroup label="Products" items={PRODUCTS} onClick={() => setOpen(false)} />
              <MobileGroup label="Information" items={INFORMATION} onClick={() => setOpen(false)} />
              <div className="mt-2 border-t border-border pt-2">
                {PRIMARY.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2 font-mono text-[12px] uppercase tracking-widest text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-widest text-bg"
              >
                Start Season
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function MegaTrigger({
  label,
  active,
  onEnter,
  onLeave,
  onClick
}: {
  label: string;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onClick={onClick}
      aria-haspopup="menu"
      aria-expanded={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors",
        active
          ? "bg-surface-2 text-fg"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      )}
    >
      {label}
      <ChevronDown
        className={cn(
          "h-3 w-3 transition-transform",
          active && "rotate-180 text-electric"
        )}
        strokeWidth={2.25}
      />
    </button>
  );
}

function MegaPanel({
  items,
  onClose,
  onEnter,
  onLeave
}: {
  items: MegaItem[];
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute inset-x-0 top-14 border-b border-border glass-strong"
    >
      <div className="mx-auto grid max-w-container gap-2 px-6 py-7 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link
              href={it.href}
              onClick={onClose}
              className="group block rounded-xl border border-transparent bg-white/[0.02] p-4 transition-colors hover:border-electric/30 hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg/60 text-electric">
                  {it.icon}
                </span>
                <p className="text-[14px] font-semibold tracking-tight text-fg group-hover:text-electric">
                  {it.title}
                </p>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
                {it.sub}
              </p>
              <p className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-subtle transition-colors group-hover:text-electric">
                Explore
                <ArrowUpRight
                  className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.25}
                />
              </p>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function SignInPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-6 top-14 z-50 w-[340px] max-h-[calc(100vh-80px)] overflow-y-auto rounded-xl border border-border bg-bg-elev shadow-xl shadow-black/40 lg:right-10"
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
            <p className="text-[13px] font-medium tracking-tight text-fg">{a.title}</p>
            <p className="mt-0.5 text-[11px] text-fg-muted">{a.sub}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a
                href={`${a.base}/sign-in`}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                className="group inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-bg transition-transform hover:scale-[1.03]"
              >
                Sign in
                <ArrowUpRight
                  className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.25}
                />
              </a>
              <a
                href={`${a.base}/sign-up`}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-1 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
              >
                Sign up
              </a>
            </div>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function MobileGroup({
  label,
  items,
  onClick
}: {
  label: string;
  items: MegaItem[];
  onClick: () => void;
}) {
  return (
    <div className="border-t border-border pt-2 first:border-t-0 first:pt-0">
      <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
        // {label}
      </p>
      {items.map((it) => (
        <Link
          key={it.title}
          href={it.href}
          onClick={onClick}
          className="block rounded-md px-3 py-2 text-[13px] text-fg hover:bg-surface-2"
        >
          <span className="font-medium">{it.title}</span>
          <span className="ml-2 text-[11px] text-fg-muted">{it.sub}</span>
        </Link>
      ))}
    </div>
  );
}
