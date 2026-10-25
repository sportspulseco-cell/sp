import {
  Bell,
  CalendarRange,
  CircleDollarSign,
  ScrollText,
  ShieldAlert,
  type LucideIcon
} from "lucide-react";
import type { Notification } from "@sportspulse/api-client";

// Shared by the inbox row and the Home preview so both show a notice the
// same way: no email delivery status, never the raw template code.

export function iconFor(code: string): LucideIcon {
  if (code.includes("payment") || code.includes("invoice")) return CircleDollarSign;
  if (code.includes("game") || code.includes("schedule")) return CalendarRange;
  if (code.includes("comply") || code.includes("waiver")) return ShieldAlert;
  if (code.includes("registration")) return ScrollText;
  return Bell;
}

export function tintFor(
  code: string
): "blue" | "violet" | "amber" | "rose" | "emerald" | "cyan" | "neutral" {
  if (code.includes("payment") || code.includes("invoice")) return "amber";
  if (code.includes("game") || code.includes("schedule")) return "blue";
  if (code.includes("comply") || code.includes("waiver")) return "rose";
  if (code.includes("registration")) return "violet";
  return "neutral";
}

// A row with no subject (older rows written outside the templates) shows
// its event in words, never the raw code ("payment.confirmed").
export function titleOf(n: Notification): string {
  if (n.subject) return n.subject;
  const words = n.templateCode.replace(/[._]+/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Notification";
}

/** When the notice was sent, or written when it has not been emailed. */
export function noticeAt(n: Notification): string {
  return n.sentAt ?? n.createdAt;
}
