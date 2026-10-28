import { REGISTRATION_STATE_LABELS } from "./registration-states";
import { TRANSFER_STATE_LABELS } from "./roster-rules";

/**
 * One word and one colour per status, in every app. Statuses come from the
 * schema's CHECK constraints (registrations, invoices, payments, games,
 * invites, roster entries, transfers, store orders, notifications, runs).
 *
 * Tone meaning:
 *   success  finished well (approved, paid, confirmed, completed)
 *   warning  waiting on someone, or needs attention (pending, partial)
 *   info     moving on its own (scheduled, queued, sent, in play)
 *   danger   failed or refused (rejected, failed, overdue, declined)
 *   neutral  ended without a problem, or not started (draft, cancelled, void)
 */
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * Where a status word means something different, the domain picks the
 * tone. A store order that is "placed" still waits on the captain; a free
 * agent who is "placed" is done. A notification that is "sent" arrived; an
 * invoice that is "sent" still waits on payment. Games use hockey words
 * ("Live", "Final"). An expired compliance document blocks play. An
 * "active" bracket or round is still being played. A team entry that is
 * "applied" was already approved and waits on the captain's dues setup.
 */
export type StatusDomain = "store_order" | "notification" | "game" | "compliance" | "bracket" | "team_entry";

const TONES: Record<string, StatusTone> = {
  // Finished well
  active: "success",
  approved: "success",
  accepted: "success",
  confirmed: "success",
  completed: "success",
  paid: "success",
  succeeded: "success",
  eligible: "success",
  verified: "success",
  clear: "success",
  published: "success",
  delivered: "success",
  synced: "success",
  served: "success",
  shipped: "success",
  placed: "success",
  present: "success",
  signed: "success",
  resolved_refund: "success",
  complete: "success",

  // Waiting on someone, or needs attention
  pending: "warning",
  pending_verification: "warning",
  pending_consent: "warning",
  pending_payment: "warning",
  pending_offline: "warning",
  pending_review: "warning",
  pending_approval: "warning",
  pending_destination: "warning",
  pending_admin: "warning",
  submitted: "warning",
  under_review: "warning",
  applied: "warning",
  extended: "warning",
  tentative: "warning",
  partial: "warning",
  partially_paid: "warning",
  incomplete: "warning",
  resubmit_requested: "warning",
  suspended: "warning",
  expiring: "warning",
  flagged: "warning",
  mismatch: "warning",
  appealed: "warning",
  postponed: "warning",
  late: "warning",
  requested: "warning",

  // Moving on its own
  scheduled: "info",
  queued: "info",
  running: "info",
  sending: "info",
  processing: "info",
  charging: "info",
  syncing: "info",
  sent: "info",
  in_play: "info",
  in_progress: "info",
  registration_open: "info",
  playoffs: "info",
  waitlisted: "info",
  assigned: "info",
  available: "info",

  // Failed or refused
  rejected: "danger",
  failed: "danger",
  declined: "danger",
  overdue: "danger",
  ineligible: "danger",
  disqualified: "danger",
  forfeited: "danger",
  dead_letter: "danger",
  adverse: "danger",
  deleted: "danger",
  dissolved: "danger",
  absent: "danger",
  blocked: "danger",
  unsigned: "danger",

  // Ended without a problem, or not started
  draft: "neutral",
  archived: "neutral",
  cancelled: "neutral",
  withdrawn: "neutral",
  void: "neutral",
  expired: "neutral",
  revoked: "neutral",
  moved: "neutral",
  returned: "neutral",
  lifted: "neutral",
  waived: "neutral",
  released: "neutral",
  suppressed: "neutral",
  resolved_no_refund: "neutral",
  closed: "neutral",
  ended: "neutral",
  sub: "neutral",
  scratched: "neutral"
};

const DOMAIN_TONES: Record<StatusDomain, Record<string, StatusTone>> = {
  store_order: { placed: "warning" },
  notification: { sent: "success" },
  game: {},
  compliance: { expired: "danger" },
  bracket: { active: "info" },
  team_entry: { applied: "info" }
};

const DOMAIN_LABELS: Record<StatusDomain, Record<string, string>> = {
  store_order: {},
  notification: {},
  game: { in_play: "Live", completed: "Final", forfeited: "Forfeit" },
  compliance: {},
  bracket: { active: "In progress" },
  team_entry: { pending_approval: "Needs your decision", applied: "Approved · captain setting up dues" }
};

const LABELS: Record<string, string> = {
  ...REGISTRATION_STATE_LABELS,
  ...TRANSFER_STATE_LABELS,
  in_play: "In play",
  partially_paid: "Partially paid",
  resubmit_requested: "Resubmit requested",
  unsigned: "Not signed",
  pending_approval: "Pending approval",
  resolved_refund: "Resolved, refunded",
  resolved_no_refund: "Resolved, no refund",
  dead_letter: "Undeliverable",
  registration_open: "Registration open",
  sub: "Sub"
};

/** Badge colour for a status. Unknown statuses are neutral. */
export function statusTone(status: string | null | undefined, domain?: StatusDomain): StatusTone {
  if (!status) return "neutral";
  const key = status.toLowerCase();
  return (domain ? DOMAIN_TONES[domain][key] : undefined) ?? TONES[key] ?? "neutral";
}

/** The word shown for a status: "pending_review" reads "Pending review". */
export function statusLabel(status: string | null | undefined, domain?: StatusDomain): string {
  if (!status) return "Unknown";
  const key = status.toLowerCase();
  const known = (domain ? DOMAIN_LABELS[domain][key] : undefined) ?? LABELS[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}
