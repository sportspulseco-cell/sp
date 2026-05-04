"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Trophy,
  Layers,
  Network,
  ListChecks,
  CalendarRange,
  CircleDot,
  BarChart3,
  ScrollText,
  X,
  type LucideIcon
} from "lucide-react";
import { useNav } from "./nav-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Pruned to what a league_admin actually does. No org / persons / users /
// roles / admin console — those are super_admin scope.
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/leagues", label: "My leagues", icon: Trophy },
  { href: "/divisions", label: "Divisions", icon: Layers },
  { href: "/teams", label: "Teams", icon: Network },
  { href: "/rosters", label: "Memberships", icon: ListChecks },
  { href: "/games", label: "Games", icon: CircleDot },
  { href: "/standings", label: "Standings", icon: BarChart3 },
  { href: "/audit", label: "Audit", icon: ScrollText }
];

export function Sidebar() {
  const { open, setOpen } = useNav();

  return (
    <>
      {/* Desktop — sticky rail */}
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex">
        <SidebarBrand />
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          <NavGroup items={NAV} />
        </nav>
        <SidebarFooter />
      </aside>

      {/* Mobile — overlay + slide-out drawer */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
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
          <SidebarBrand inline />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          <NavGroup items={NAV} />
        </nav>
        <SidebarFooter />
      </aside>
    </>
  );
}

function SidebarBrand({ inline = false }: { inline?: boolean }) {
  return (
    <div className={inline ? "" : "border-b border-border px-3 py-3"}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fg text-bg">
          <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-fg">SportsPulse</p>
          <p className="truncate text-[11px] text-fg-muted">League admin</p>
        </div>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border px-4 py-3 text-[11px] text-fg-muted">
      <span className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        All systems operational
      </span>
    </div>
  );
}

function NavGroup({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { setOpen } = useNav();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors duration-fast ease-ease",
                active
                  ? "bg-surface-2 text-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-fg" : "text-fg-muted group-hover:text-fg"
                )}
                strokeWidth={1.75}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
