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
  type LucideIcon
} from "lucide-react";

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
  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex">
      <div className="border-b border-border px-3 py-3">
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
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <NavGroup items={NAV} />
      </nav>
      <div className="border-t border-border px-4 py-3 text-[11px] text-fg-muted">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          All systems operational
        </span>
      </div>
    </aside>
  );
}

function NavGroup({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
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
