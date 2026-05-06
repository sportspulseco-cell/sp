/**
 * Registration submission state machine.
 *
 * Source of truth for Workflow 1 v2.0 §10. Defines:
 *   - the full set of states a registration can be in
 *   - the valid transitions (no skipping, no backwards moves except
 *     the explicit ones noted below)
 *   - human descriptions used in admin UI tooltips
 *
 * Mapped 1:1 to `registrations.status` (with the column's CHECK
 * constraint relaxed in migration 0015 so all values are storable).
 *
 * Why a state machine and not free-form strings:
 * - prevents bugs like marking a `pending_verification` row `approved`
 * - lets the admin dashboard derive the next legal action from the
 *   current state instead of branching on every page
 * - lets the audit trail render transitions as human prose
 */

export const REGISTRATION_STATES = [
  /** Initial blank — submission row exists, no further progress yet. */
  "draft",
  /** Auth user not yet email-verified; further steps blocked. */
  "pending_verification",
  /** Minor — parent consent email out, waiting on signature. */
  "pending_consent",
  /** Waivers + eligibility passed; awaiting Stripe confirmation. */
  "pending_payment",
  /** Offline payment chosen; admin must mark paid manually. */
  "pending_offline",
  /** Payment captured (or offline marked paid); admin/captain async review. */
  "pending_review",
  /** Admin requested resubmission; player can re-upload + resume. */
  "incomplete",
  /** Final happy-path — player on roster / free agent pool. */
  "approved",
  /** Final unhappy-path — refund issued (per league policy). */
  "rejected",
  /** Player cancelled before approval; refund per policy. */
  "cancelled"
] as const;

export type RegistrationState = (typeof REGISTRATION_STATES)[number];

/**
 * Human-readable descriptions for the admin dashboard.
 */
export const REGISTRATION_STATE_LABELS: Record<RegistrationState, string> = {
  draft: "Draft",
  pending_verification: "Pending email verification",
  pending_consent: "Pending parental consent",
  pending_payment: "Pending payment",
  pending_offline: "Pending offline payment",
  pending_review: "Pending review",
  incomplete: "Incomplete — resubmission requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled"
};

/**
 * Valid transitions per the spec. Read as "from `key`, can go to any
 * state in the array."
 *
 * Notes:
 * - `pending_review → incomplete` lets admin send back for fixes
 * - `incomplete → pending_review` is the player resubmitting
 * - `cancelled` is terminal except an admin reactivation flow we'll
 *   add in Phase 5; for now treat as terminal.
 */
export const REGISTRATION_TRANSITIONS: Record<
  RegistrationState,
  ReadonlyArray<RegistrationState>
> = {
  draft: ["pending_verification", "pending_payment", "cancelled"],
  pending_verification: ["pending_consent", "pending_payment", "cancelled"],
  pending_consent: ["pending_payment", "cancelled"],
  pending_payment: ["pending_review", "pending_offline", "cancelled"],
  pending_offline: ["pending_review", "cancelled"],
  pending_review: ["approved", "rejected", "incomplete"],
  incomplete: ["pending_review", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: []
};

/**
 * Hard guard: throws when the caller tries to drive a row into an
 * illegal state. Use this in command handlers, NOT in DB triggers —
 * the trigger is the safety net, this is the helpful error.
 */
export function assertValidTransition(
  from: RegistrationState,
  to: RegistrationState
): void {
  const allowed = REGISTRATION_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Illegal registration transition: ${from} → ${to}. Allowed from ${from}: ${
        allowed.length === 0 ? "(terminal)" : allowed.join(", ")
      }.`
    );
  }
}

/**
 * Soft check: returns whether a transition is valid without throwing.
 * Used by the admin UI to enable/disable action buttons.
 */
export function canTransition(
  from: RegistrationState,
  to: RegistrationState
): boolean {
  return REGISTRATION_TRANSITIONS[from].includes(to);
}

/**
 * Terminal states never transition further. The admin UI treats them
 * as read-only.
 */
export function isTerminal(state: RegistrationState): boolean {
  return REGISTRATION_TRANSITIONS[state].length === 0;
}

/**
 * Type guard for runtime values coming off the wire.
 */
export function isRegistrationState(v: unknown): v is RegistrationState {
  return (
    typeof v === "string" &&
    (REGISTRATION_STATES as ReadonlyArray<string>).includes(v)
  );
}
