// Navigation for the console: the sidebar, the breadcrumb trail and the
// site map all read this list, so a page has one name everywhere.
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
  type LucideIcon
} from "lucide-react";
import type { SiteMapGroup } from "@sportspulse/ui";

export type NavItem =
  | { href: string; label: string; icon: LucideIcon; superOnly?: boolean }
  | { section: string };

/**
 * Scoped admins (league / org / season / division) sign in here and see
 * a role-filtered console. Modules that only a super admin can use are
 * dropped from their navigation instead of opening to "Super admin
 * access required" (PPHL, 24 Oct 2026: "so many modules").
 */
export function navFor(items: NavItem[], isSuperAdmin: boolean): NavItem[] {
  if (isSuperAdmin) return items;
  const kept = items.filter((item) => "section" in item || !item.superOnly);
  // Drop a section header whose every item was removed.
  return kept.filter((item, i) => {
    if (!("section" in item)) return true;
    const next = kept[i + 1];
    return next !== undefined && !("section" in next);
  });
}

export const PLATFORM_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard }
];

// Grouped the way a league operator works, and the way SportsEngine HQ
// groups it (Season Management, Registration, Members, Financials,
// Messages, Reports, Settings): doc/ux/competitor-ia.md, section F.
// Labels are the page titles, word for word.
export const PROJECT_NAV: NavItem[] = [
  { section: "Season" },
  { href: "/org-setup", label: "Set up a season", icon: Wand2 },
  { href: "/seasons", label: "Seasons", icon: CalendarRange },
  { href: "/leagues", label: "Leagues", icon: Trophy },
  { href: "/divisions", label: "Divisions", icon: Layers },
  { href: "/scheduling", label: "Schedule", icon: CalendarClock },
  { href: "/venues", label: "Rinks & ice time", icon: Building2 },

  { section: "Teams" },
  { href: "/teams", label: "Teams", icon: Network },
  { href: "/division-applications", label: "Team applications", icon: ClipboardList },
  { href: "/rosters", label: "Rosters", icon: ListChecks },
  { href: "/transfers", label: "Transfers", icon: ShieldCheck },

  { section: "Registration" },
  { href: "/forms", label: "Registration forms", icon: FileSignature },
  { href: "/registrations", label: "Registrations", icon: ClipboardList },
  { href: "/eligibility", label: "Eligibility", icon: ShieldCheck },
  { href: "/documents", label: "Waivers & documents", icon: FileSignature },

  { section: "Games & results" },
  { href: "/games", label: "Games", icon: CircleDot },
  { href: "/game-events", label: "Game log", icon: Activity },
  { href: "/stats", label: "Stats & standings", icon: BarChart3 },

  { section: "Members" },
  { href: "/users", label: "Users", icon: Users },
  { href: "/persons", label: "People", icon: UserCircle2 },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/roles", label: "Roles & permissions", icon: ShieldCheck },

  { section: "Financials" },
  { href: "/finance", label: "Invoices", icon: Wallet },
  { href: "/payments", label: "Payments & refunds", icon: Wallet },

  { section: "Messages" },
  { href: "/communications", label: "Messages", icon: MessageSquare },

  { section: "Reports" },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/no-show-report", label: "Teams that did not return", icon: ClipboardList },
  { href: "/audit", label: "Activity log", icon: ScrollText },

  { section: "Settings" },
  { href: "/admin", label: "Platform settings", icon: Settings2, superOnly: true },
  { href: "/data-migration", label: "Import data", icon: Database, superOnly: true }
];

/** The nav as groups (Home first), filtered for the role: the site map. */
export function navGroups(isSuperAdmin: boolean): SiteMapGroup[] {
  const groups: SiteMapGroup[] = [
    { label: "Home", items: navFor(PLATFORM_NAV, isSuperAdmin).flatMap((i) => ("href" in i ? [{ href: i.href, label: i.label }] : [])) }
  ];
  for (const item of navFor(PROJECT_NAV, isSuperAdmin)) {
    if ("section" in item) groups.push({ label: item.section, items: [] });
    else groups[groups.length - 1]?.items.push({ href: item.href, label: item.label });
  }
  return groups;
}

/** Every page in the nav, for breadcrumb labels. */
export const ALL_NAV_LINKS = [
  ...[...PLATFORM_NAV, ...PROJECT_NAV].flatMap((i) => ("href" in i ? [{ href: i.href, label: i.label }] : [])),
  { href: "/site-map", label: "Site map" }
];
