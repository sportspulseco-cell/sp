"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UserCircle2,
  Building2,
  Trophy,
  Layers,
  Network,
  ListChecks,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  ScrollText,
  FileSignature,
  ShieldCheck,
  Activity,
  Wand2,
  BarChart3,
  CircleDot,
  Wallet,
  MessageSquare,
  FileBarChart,
  Settings2,
  Database,
  X,
  type LucideIcon
} from "lucide-react";
import { useNav } from "./nav-context";

type NavItem =
  | { href: string; label: string; icon: LucideIcon }
  | { section: string };

const PLATFORM_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/persons", label: "Persons", icon: UserCircle2 },
  { href: "/roles", label: "Roles", icon: ShieldCheck },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/admin", label: "Admin Console", icon: Settings2 }
];

const PROJECT_NAV: NavItem[] = [
  { section: "Setup" },
  { href: "/org-setup", label: "Org setup", icon: Wand2 },

  { section: "League" },
  { href: "/seasons", label: "Seasons", icon: CalendarRange },
  { href: "/leagues", label: "Leagues", icon: Trophy },
  { href: "/divisions", label: "Divisions", icon: Layers },
  { href: "/teams", label: "Teams", icon: Network },
  { href: "/rosters", label: "Memberships", icon: ListChecks },

  { section: "Compliance" },
  { href: "/registrations", label: "Registrations", icon: ClipboardList },
  { href: "/division-applications", label: "Division apps", icon: ClipboardList },
  { href: "/transfers", label: "Transfers", icon: ShieldCheck },
  { href: "/no-show-report", label: "No-show report", icon: ClipboardList },
  { href: "/forms", label: "Forms", icon: FileSignature },
  { href: "/documents", label: "Documents", icon: FileSignature },
  { href: "/eligibility", label: "Eligibility", icon: ShieldCheck },

  { section: "Operations" },
  { href: "/scheduling", label: "Schedule", icon: CalendarClock },
  { href: "/venues", label: "Venues", icon: Building2 },
  { href: "/games", label: "Games", icon: CircleDot },
  { href: "/game-events", label: "Game events", icon: Activity },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/finance", label: "Invoices", icon: Wallet },
  { href: "/payments", label: "Finance ops", icon: Wallet },
  { href: "/communications", label: "Communications", icon: MessageSquare },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/data-migration", label: "Data Migration", icon: Database }
];

export function Sidebar() {
  const { open, setOpen } = useNav();

  return (
    <>
      {/* Desktop — sticky rail */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex">
        <div className="border-b border-border px-3 py-3">
          <WorkspaceSwitcher />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-4 scrollbar-thin">
          <NavGroup items={PLATFORM_NAV} />
          <div className="my-3 mx-2 h-px bg-border" />
          <ProjectNav />
        </nav>
        <SidebarFooter />
      </aside>

      {/* Mobile — overlay + slide-out drawer */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] max-w-[85vw] flex-col border-r border-border bg-bg-subtle transition-transform duration-200 ease-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <div className="flex-1 min-w-0">
            <WorkspaceSwitcher />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-4 scrollbar-thin">
          <NavGroup items={PLATFORM_NAV} />
          <div className="my-3 mx-2 h-px bg-border" />
          <ProjectNav />
        </nav>
        <SidebarFooter />
      </aside>
    </>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border px-4 py-3 text-xs text-fg-muted">
      Platform administration
    </div>
  );
}

function ProjectNav() {
  const pathname = usePathname();
  const groups: { label: string; items: NavItem[] }[] = [];
  for (const item of PROJECT_NAV) {
    if ("section" in item) groups.push({ label: item.section, items: [] });
    else groups[groups.length - 1]?.items.push(item);
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const active = group.items.some((item) => "href" in item &&
          (pathname === item.href || pathname.startsWith(`${item.href}/`)));
        return (
          <details key={`${group.label}-${active}`} open={active || group.label === "Setup"} className="group/nav">
            <summary className="cursor-pointer rounded-md px-3 py-2 text-xs font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg marker:hidden list-none flex items-center justify-between">
              {group.label}
              <span aria-hidden className="text-fg-subtle group-open/nav:rotate-180 transition-transform">⌄</span>
            </summary>
            <NavGroup items={group.items} />
          </details>
        );
      })}
    </div>
  );
}

function NavGroup({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { setOpen } = useNav();
  return (
    <ul className="space-y-px">
      {items.map((item, idx) => {
        if ("section" in item) {
          return (
            <li
              key={`s-${idx}`}
              className="mt-5 flex items-center gap-1.5 px-3 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-fg-subtle first:mt-0"
            >
              <span className="text-fg-subtle/70">//</span>
              <span>{item.section}</span>
            </li>
          );
        }
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "group relative flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-fast ease-ease",
                active
                  ? "text-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              {/* Sliding accent rail — single element shared via layoutId
                  so it animates between active routes as you navigate. */}
              {active ? (
                <motion.span
                  layoutId="sidebar-active"
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-[--accent]/10 ring-1 ring-inset ring-[--accent]/20"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32
                  }}
                />
              ) : null}
              {active ? (
                <motion.span
                  layoutId="sidebar-active-bar"
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[--accent]"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32
                  }}
                />
              ) : null}
              <Icon
                className={cn(
                  "relative h-4 w-4 shrink-0",
                  active
                    ? "text-[--accent]"
                    : "text-fg-muted group-hover:text-fg"
                )}
                strokeWidth={1.75}
              />
              <span className="relative truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function WorkspaceSwitcher() {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left">
      <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fg text-bg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-3.5 w-3.5"
        >
          <path d="m12 14 4-4" />
          <path d="M3.34 19a10 10 0 1 1 17.32 0" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px] font-semibold text-fg">SportsPulse</p>
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.22em] text-fg-muted">
          platform · admin
        </p>
      </div>
    </div>
  );
}
