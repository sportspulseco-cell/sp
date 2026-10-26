// Navigation for the console: the sidebar, the breadcrumb trail and the
// site map all read this list, so a page has one name everywhere. The
// shell that renders it is shared (@sportspulse/ui AppShell).
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
  Database
} from "lucide-react";
import { navSiteMap, type ShellNavItem, type ShellNavSection, type SiteMapGroup } from "@sportspulse/ui";

type AdminNavItem = ShellNavItem & { superOnly?: boolean };
type AdminNavSection = Omit<ShellNavSection, "items"> & { items: AdminNavItem[] };

export const HOME = { href: "/dashboard", label: "Home" } as const;

// Grouped the way a league operator works, and the way SportsEngine HQ
// groups it (Season Management, Registration, Members, Financials,
// Messages, Reports, Settings): doc/ux/competitor-ia.md, section F.
// Labels are the page titles, word for word.
const ADMIN_NAV: AdminNavSection[] = [
  { items: [{ href: HOME.href, label: HOME.label, icon: LayoutDashboard }] },
  {
    label: "Season",
    defaultOpen: true,
    items: [
      { href: "/org-setup", label: "Set up a season", icon: Wand2 },
      { href: "/seasons", label: "Seasons", icon: CalendarRange },
      { href: "/leagues", label: "Leagues", icon: Trophy },
      { href: "/divisions", label: "Divisions", icon: Layers },
      { href: "/scheduling", label: "Schedule", icon: CalendarClock },
      { href: "/venues", label: "Rinks & ice time", icon: Building2 }
    ]
  },
  {
    label: "Teams",
    items: [
      { href: "/teams", label: "Teams", icon: Network },
      { href: "/division-applications", label: "Team applications", icon: ClipboardList },
      { href: "/rosters", label: "Rosters", icon: ListChecks },
      { href: "/transfers", label: "Transfers", icon: ShieldCheck }
    ]
  },
  {
    label: "Registration",
    items: [
      { href: "/forms", label: "Registration forms", icon: FileSignature },
      { href: "/registrations", label: "Registrations", icon: ClipboardList },
      { href: "/eligibility", label: "Eligibility", icon: ShieldCheck },
      { href: "/documents", label: "Waivers & documents", icon: FileSignature }
    ]
  },
  {
    label: "Games & results",
    items: [
      { href: "/games", label: "Games", icon: CircleDot },
      { href: "/game-events", label: "Game log", icon: Activity },
      { href: "/stats", label: "Stats & standings", icon: BarChart3 }
    ]
  },
  {
    label: "Members",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/persons", label: "People", icon: UserCircle2 },
      { href: "/organizations", label: "Organizations", icon: Building2 },
      { href: "/roles", label: "Roles & permissions", icon: ShieldCheck }
    ]
  },
  {
    label: "Financials",
    items: [
      { href: "/finance", label: "Invoices", icon: Wallet },
      { href: "/payments", label: "Payments & refunds", icon: Wallet }
    ]
  },
  { label: "Messages", items: [{ href: "/communications", label: "Messages", icon: MessageSquare }] },
  {
    label: "Reports",
    items: [
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/no-show-report", label: "Teams that did not return", icon: ClipboardList },
      { href: "/audit", label: "Activity log", icon: ScrollText }
    ]
  },
  {
    label: "Settings",
    items: [
      { href: "/admin", label: "Platform settings", icon: Settings2, superOnly: true },
      { href: "/data-migration", label: "Import data", icon: Database, superOnly: true }
    ]
  }
];

/**
 * Scoped admins (league / org / season / division) sign in here and see
 * a role-filtered console. Modules that only a super admin can use are
 * dropped from their navigation instead of opening to "Super admin
 * access required" (PPHL, 24 Oct 2026: "so many modules"). A section
 * whose every item was removed is dropped too.
 */
function filterNav(isSuperAdmin: boolean): ShellNavSection[] {
  return ADMIN_NAV.map((s) => ({ ...s, items: s.items.filter((i) => isSuperAdmin || !i.superOnly) })).filter(
    (s) => s.items.length > 0
  );
}

const SUPER_NAV = filterNav(true);
const SCOPED_NAV = filterNav(false);

export function navFor(isSuperAdmin: boolean): ShellNavSection[] {
  return isSuperAdmin ? SUPER_NAV : SCOPED_NAV;
}

/** The nav as groups (Home first), filtered for the role: the site map. */
export function navGroups(isSuperAdmin: boolean): SiteMapGroup[] {
  return navSiteMap(navFor(isSuperAdmin), HOME.label);
}

/** Every page of the console, so breadcrumbs only link to real pages. */
export const ROUTES = [
  "/admin", "/audit", "/audit/[id]", "/communications", "/communications/compose", "/communications/templates",
  "/dashboard", "/data-migration", "/data-migration/[id]", "/division-applications", "/divisions", "/divisions/[id]",
  "/documents", "/documents/[id]", "/eligibility", "/finance", "/finance/[id]", "/finance/ar", "/finance/create",
  "/forms", "/forms/[id]", "/game-events", "/games", "/games/[id]", "/leagues", "/leagues/[id]", "/no-show-report",
  "/org-setup", "/organizations", "/organizations/[id]", "/payments", "/persons", "/persons/[id]", "/registrations",
  "/reports", "/reports/misconduct", "/roles", "/roles/[id]", "/rosters", "/scheduling",
  "/scheduling/[seasonId]/conflicts", "/scheduling/[seasonId]/fairness", "/scheduling/[seasonId]/generate",
  "/scheduling/[seasonId]/parity", "/scheduling/[seasonId]/playoffs", "/scheduling/[seasonId]/rinks",
  "/scheduling/[seasonId]/runs", "/scheduling/[seasonId]/tournament", "/scheduling/[seasonId]/verify", "/seasons",
  "/seasons/[id]", "/seasons/[id]/applications", "/site-map", "/stats", "/teams", "/teams/[id]", "/teams/new",
  "/transfers", "/users", "/users/[id]", "/venues"
] as const;
