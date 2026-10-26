/**
 * Notification template codes: the one list the API sends with and the
 * admin template editor offers. Bodies and defaults live in the API's
 * communications catalog; this is only the code set, so the web apps and
 * the API never drift.
 */

export const NOTIFICATION_TEMPLATE_CODES = [
  "registration.submitted",
  "registration.approved",
  "registration.rejected",
  "registration.waitlisted",
  "game.scheduled",
  "game.postponed",
  "game.cancelled",
  "game.finalized",
  // UC-07 / UC-21 manual move of a game's time or rink (SCH-6).
  "game.rescheduled",
  // FR-3.9: a referee or scorekeeper is put on a game's crew.
  "game.official_assigned",
  // UC-08 a schedule run is published: one digest per person per team (SCH-8).
  "schedule.published",
  // FR-3.17.3 auto-reminder about a day before a game.
  "game.reminder",
  "suspension.issued",
  // UC-14 automatic suspensions: the team's captains and the league's admins (COMP-11).
  "suspension.issued.captain",
  "suspension.issued.admin",
  "suspension.changed",
  "suspension.lifted",
  "roster.added",
  // Registration approved with a team: the captain is told (FR-3.4.1).
  "roster.added.captain",
  // Approved, but the team filled up or locked meanwhile: not rostered.
  "roster.not_placed.captain",
  "roster.dropped",
  // An invite, offer, add or join request for a player with no season
  // registration: register with the team set to join (UC-04).
  "TEAM_JOIN_REGISTER",
  // UC-04 alternative flow: the player declined, the captain is told.
  "TEAM_INVITE_DECLINED",
  // Workflow 7A · captain rollover
  "TEAM_INVITE_NEW",
  "TEAM_INVITE_RETURNING",
  "SUB_INVOICE_SENT",
  "TEAM_CONFIRMED",
  "CAPTAIN_ASSIGNED",
  "TEAM_CREATED",
  // Workflow 7B · roster management
  "INVITE_REMINDER_1",
  "INVITE_REMINDER_2",
  "INVITE_EXPIRED_CAPTAIN",
  "DROP_CONFIRMED",
  "REFUND_ASSESSMENT_REQUIRED",
  "TRANSFER_REQUEST",
  "TRANSFER_REJECTED",
  "TRANSFER_APPROVED",
  "TRANSFER_ACCEPTED",
  // Team store (UC-25, UC-26, MON-15).
  "team_store.open",
  "store.order.placed",
  "store.order.status",
  "CAPTAIN_REVOKED",
  "DIVISION_APPLICATION_REJECTED",
  // Workflow 7C · compliance + eligibility
  "ELIGIBILITY_WAIVED",
  // COMP-7: an admin waived a player's eligibility check (player, captains).
  "eligibility.waived",
  "eligibility.waived.captain",
  "USA_HOCKEY_EXPIRING_SOON",
  "USA_HOCKEY_EXPIRED",
  "USA_HOCKEY_EXPIRED_CAPTAIN",
  "COMPLIANCE_SWEEP_COMPLETE",
  "PLAYOFF_INELIGIBLE",
  "DUPLICATE_ID_FLAGGED",
  "REGISTRATION_UNDER_REVIEW",
  // COMP-1 / UC-29: an admin decided on an uploaded ID or eligibility document.
  "compliance.document.decided",
  "compliance.document.decided.captain",
  // Approval-gate (Team Registration via Admin Approval brief)
  "TEAM_REGISTRATION_APPLIED",
  "TEAM_REGISTRATION_APPLIED_CONFIRMATION",
  "TEAM_REGISTRATION_APPROVED",
  "TEAM_REGISTRATION_REJECTED",
  "TEAM_REGISTRATION_WITHDRAWN",
  // Player → captain join requests
  "PLAYER_JOIN_REQUEST",
  "PLAYER_JOIN_APPROVED",
  "PLAYER_JOIN_REJECTED",
  // Free-agent pool offers (UC-03, CAP-9): captain or admin offers a
  // spot, the player accepts or declines, the offering side is told.
  "FREE_AGENT_OFFER",
  "FREE_AGENT_OFFER_ACCEPTED",
  "FREE_AGENT_OFFER_DECLINED",
  // FR-3.4.7: a new free agent who fits a team with open spots, to its captains.
  "FREE_AGENT_PITCH",
  // UC-31 substitute requests: a captain asks a player to sub for one
  // game, the player answers, a league admin may assign one directly.
  "SUB_REQUEST",
  "SUB_REQUEST_CANCELLED",
  "SUB_REQUEST_ACCEPTED",
  "SUB_REQUEST_DECLINED",
  "SUB_ASSIGNED",
  "SUB_ASSIGNED_CAPTAIN",
  "SUB_ADDED_ADMIN",
  // Payments & Invoicing
  "INVOICE_OVERDUE_STAGE_1",
  "INVOICE_OVERDUE_STAGE_2",
  "INVOICE_OVERDUE_STAGE_3",
  "INVOICE_OVERDUE_STAGE_4",
  "INVOICE_MANUAL_REMIND",
  "SUB_INVOICE_REMINDER",
  "DUES_COVERED_BY_CAPTAIN",
  // Payments & Invoicing — Phase 16 (dotted codes used by cron + admin)
  "invoice.created",
  // UC-16: a team invoice for the captain to split on Dues (MON-23).
  "team_dues.created",
  "payment.confirmed",
  "installment.failed",
  "invoice.late_fee_applied",
  "invoice.overdue.r1",
  "invoice.overdue.r2",
  "invoice.overdue.r3",
  "invoice.overdue.r4",
  "invoice.overdue.admin_case",
  "invoice.manual_reminder",
  "invoice.due_date_extended",
  "refund.issued",
  "wallet.credited",
  "wallet.credit_expired",
  "captain.covered_dues",
  // UC-16: the captain's receipt after paying part or all of a player's share.
  "captain.cover_receipt",
  // Ad-hoc broadcast composed by an org-admin (Backlog #6 / #17).
  // subject + body are inline-rendered from the payload — no fixed body.
  "org.broadcast"
] as const;

export type NotificationTemplateCode = (typeof NOTIFICATION_TEMPLATE_CODES)[number];
