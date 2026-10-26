// Navigation for the team console. The sidebar, the breadcrumb trail
// and the shared shell (@sportspulse/ui AppShell) all read it.
import {
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Mail,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Users
} from "lucide-react";
import type { ShellNavSection } from "@sportspulse/ui";

export const HOME = { href: "/", label: "Home" } as const;

// Coaches and assistants (no captain role): the team's read-only views.
export const COACH_NAV: ShellNavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard },
      { href: "/roster", label: "Roster", icon: Users },
      { href: "/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/lineups", label: "Game lineups", icon: ListChecks },
      { href: "/stats", label: "Stats & standings", icon: BarChart3 }
      // Release 1 (PPHL, Oct 2026): Communications (/comms) is a
      // placeholder page and stays out of the navigation until built.
    ]
  }
];

// Captains: the same jobs grouped the way a team manager thinks of them
// (doc/ux/competitor-ia.md section F). One Roster entry, the managed one;
// the read-only /roster stays for coaches. Few items, so every group is
// open by default.
export const CAPTAIN_NAV: ShellNavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard },
      { href: "/schedule", label: "Schedule", icon: CalendarRange },
      { href: "/lineups", label: "Game lineups", icon: ListChecks },
      { href: "/stats", label: "Stats & standings", icon: BarChart3 }
    ]
  },
  {
    label: "Your team",
    defaultOpen: true,
    items: [
      { href: "/captain/roster", label: "Roster", icon: Users },
      { href: "/captain/invites", label: "Invite players", icon: Mail },
      { href: "/captain/join-requests", label: "Join requests", icon: Inbox },
      { href: "/captain/free-agents", label: "Free agents", icon: Star },
      { href: "/comms", label: "Message the team", icon: Send },
      { href: "/captain/team", label: "Team settings", icon: Settings }
    ]
  },
  {
    label: "This season",
    defaultOpen: true,
    items: [
      // Always reachable: an in-season team must still be able to
      // register for the next season (CAP-6). The CTA above the nav is
      // the time-bound signal; this is the permanent route.
      { href: "/captain/register", label: "Register the team", icon: Sparkles },
      { href: "/captain/dues", label: "Dues", icon: CircleDollarSign },
      { href: "/captain/compliance", label: "Waivers & documents", icon: ShieldCheck },
      // Back in the menu now that players can order and pay (MON-15).
      { href: "/captain/store", label: "Team store", icon: ShoppingBag }
    ]
  }
];

/** Every page of the console, so breadcrumbs only link to real pages. */
export const ROUTES = [
  "/", "/captain/compliance", "/captain/dues", "/captain/free-agents", "/captain/invites", "/captain/join-requests",
  "/captain/register", "/captain/register/[seasonId]", "/captain/register/setup/[entryId]", "/captain/roster",
  "/captain/store", "/captain/team", "/comms", "/lineups", "/lineups/[gameId]", "/roster", "/schedule", "/stats"
] as const;
