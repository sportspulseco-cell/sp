// Navigation for the organization console. The sidebar, the breadcrumb
// trail and the shared shell (@sportspulse/ui AppShell) all read it.
import {
  Building,
  Building2,
  CalendarClock,
  CalendarRange,
  FileBarChart,
  FileSignature,
  Gavel,
  Layers,
  LayoutDashboard,
  Mail,
  Network,
  ScrollText,
  Trophy,
  Wallet,
  Wand2
} from "lucide-react";
import type { ShellNavSection } from "@sportspulse/ui";

export const HOME = { href: "/", label: "Home" } as const;

// Same groups as the admin console (doc/ux/competitor-ia.md, section F),
// filtered to what an organization admin does.
export const NAV: ShellNavSection[] = [
  { items: [{ href: "/", label: "Home", icon: LayoutDashboard }] },
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
  { label: "Teams", items: [{ href: "/teams", label: "Teams", icon: Network }] },
  {
    label: "Registration",
    // Reviewing registrations is the org admin's daily job: keep it in view.
    defaultOpen: true,
    items: [
      { href: "/forms", label: "Registration forms", icon: FileSignature },
      { href: "/registrations", label: "Registrations", icon: ScrollText }
    ]
  },
  {
    label: "Financials",
    items: [
      { href: "/finance", label: "Invoices", icon: Wallet },
      { href: "/disputes", label: "Refund disputes", icon: Gavel }
    ]
  },
  { label: "Messages", items: [{ href: "/communications", label: "Messages", icon: Mail }] },
  { label: "Reports", items: [{ href: "/audit", label: "Activity log", icon: FileBarChart }] },
  { label: "Settings", items: [{ href: "/organization", label: "Organization", icon: Building }] }
];

/** Every page of the console, so breadcrumbs only link to real pages. */
export const ROUTES = [
  "/", "/audit", "/audit/[id]", "/communications", "/communications/compose", "/disputes", "/divisions",
  "/divisions/[id]", "/finance", "/finance/[id]", "/finance/create", "/forms", "/forms/[id]", "/leagues",
  "/leagues/[id]", "/org-setup", "/organization", "/registrations", "/scheduling",
  "/scheduling/[seasonId]/conflicts", "/scheduling/[seasonId]/fairness", "/scheduling/[seasonId]/generate",
  "/scheduling/[seasonId]/parity", "/scheduling/[seasonId]/playoffs", "/scheduling/[seasonId]/rinks",
  "/scheduling/[seasonId]/runs", "/scheduling/[seasonId]/tournament", "/scheduling/[seasonId]/verify", "/seasons",
  "/seasons/[id]", "/teams", "/teams/[teamId]", "/teams/new", "/venues"
] as const;
