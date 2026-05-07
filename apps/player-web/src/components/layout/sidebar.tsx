"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarRange,
  ChartBar,
  Compass,
  CreditCard,
  LayoutDashboard,
  Mail,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  User,
  Users,
  UsersRound,
  Video,
  X,
  type LucideIcon
} from "lucide-react";
import { cn } from "@sportspulse/ui";
import { useNav } from "./nav-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  /** Optional uppercase mono label rendered above the items. */
  label?: string;
  items: NavItem[];
}

/**
 * Player app nav — grouped per Workflow 5 §1.3:
 *   - top: Home (no section label)
 *   - "My game" — Schedule, Stats, Video
 *   - "My team" — Team, Team store
 *   - "My account" — Payments, Compliance, Notifications
 *   - "Captain console" — only when scope.roleCodes includes 'captain'
 *   - "Discover" — Find a team, Profile
 *
 * The captain section is the dual-role surface: a player who's also
 * been elected captain of their team gets four extra pages here for
 * roster / invites / free-agent / team-profile management. Hidden
 * for non-captains.
 */
const BASE_NAV: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard }
    ]
  },
  {
    label: "// My game",
    items: [
      { href: "/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/stats", label: "Stats", icon: ChartBar },
      { href: "/video", label: "Video", icon: Video }
    ]
  },
  {
    label: "// My team",
    items: [
      { href: "/team", label: "Team", icon: UsersRound },
      { href: "/store", label: "Team store", icon: ShoppingBag }
    ]
  },
  {
    label: "// My account",
    items: [
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
      { href: "/notifications", label: "Notifications", icon: Bell }
    ]
  }
];

const CAPTAIN_NAV: NavSection = {
  label: "// Captain console",
  items: [
    { href: "/captain/team", label: "Manage team", icon: Settings },
    { href: "/captain/roster", label: "Manage roster", icon: Users },
    { href: "/captain/invites", label: "Invites", icon: Mail },
    { href: "/captain/free-agents", label: "Free agents", icon: Star }
  ]
};

const DISCOVER_NAV: NavSection = {
  label: "// Discover",
  items: [
    { href: "/register", label: "Find a team", icon: Compass },
    { href: "/profile", label: "Profile", icon: User }
  ]
};

export function Sidebar({ isCaptain = false }: { isCaptain?: boolean }) {
  const { open, setOpen } = useNav();
  const sections = isCaptain
    ? [...BASE_NAV, CAPTAIN_NAV, DISCOVER_NAV]
    : [...BASE_NAV, DISCOVER_NAV];

  return (
    <>
      {/* Desktop — sticky rail */}
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex">
        <SidebarBrand />
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {sections.map((section, i) => (
            <NavGroup key={i} section={section} />
          ))}
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
          {sections.map((section, i) => (
            <NavGroup key={i} section={section} />
          ))}
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
          <User className="h-3.5 w-3.5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-fg">SportsPulse</p>
          <p className="truncate text-[11px] text-fg-muted">Player</p>
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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        All systems operational
      </span>
    </div>
  );
}

function NavGroup({ section }: { section: NavSection }) {
  const pathname = usePathname();
  const { setOpen } = useNav();
  return (
    <div className="mb-3">
      {section.label ? (
        <p className="px-2 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {section.label}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {section.items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors",
                  active
                    ? "border-l-2 border-accent bg-surface-2 text-fg"
                    : "border-l-2 border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
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
    </div>
  );
}
