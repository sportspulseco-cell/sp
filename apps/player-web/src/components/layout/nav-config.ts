// Navigation for the player console. The sidebar, the breadcrumb trail
// and the shared shell (@sportspulse/ui AppShell) all read it.
import {
  Bell,
  CalendarRange,
  ChartBar,
  Compass,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  ShoppingBag,
  User,
  UsersRound
} from "lucide-react";
import type { ShellNavSection } from "@sportspulse/ui";

export const HOME = { href: "/", label: "Home" } as const;

/**
 * Grouped per Workflow 5 §1.3. Few items, so every group is open by
 * default. The captain console lives in team-admin-web; dual-role
 * users see a banner on Home that deep-links there.
 */
export const NAV: ShellNavSection[] = [
  { items: [{ href: "/", label: "Home", icon: LayoutDashboard }] },
  {
    label: "My games",
    defaultOpen: true,
    items: [
      { href: "/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/stats", label: "Stats", icon: ChartBar }
      // Release 1 (PPHL, Oct 2026): Video (/video) is a placeholder page
      // and stays out of the navigation until the pipeline exists.
    ]
  },
  {
    label: "My team",
    defaultOpen: true,
    items: [
      { href: "/team", label: "Team", icon: UsersRound },
      // Back in the menu now that players can order and pay (MON-15).
      { href: "/store", label: "Team store", icon: ShoppingBag }
    ]
  },
  {
    label: "My account",
    defaultOpen: true,
    items: [
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/compliance", label: "Waivers & documents", icon: ShieldCheck },
      { href: "/notifications", label: "Notifications", icon: Bell }
    ]
  },
  {
    label: "Register",
    defaultOpen: true,
    items: [
      { href: "/register", label: "Find a season", icon: Compass },
      { href: "/profile", label: "Profile", icon: User }
    ]
  }
];

/** Every page inside the console, so breadcrumbs only link to real pages. */
export const ROUTES = [
  "/", "/compliance", "/notifications", "/notifications/settings", "/payments", "/profile", "/register",
  "/register/free-agent", "/registrations", "/registrations/[id]", "/registrations/[id]/teams", "/schedule",
  "/stats", "/store", "/team", "/video"
] as const;
