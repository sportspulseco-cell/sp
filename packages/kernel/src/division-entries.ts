/**
 * Division entry statuses under which a team plays in the division: the
 * scheduler places it, the "teams in this division" list shows it, and a
 * hand-made game may use it. `pending_approval` (waiting for an admin)
 * and the closed statuses (withdrawn, rejected, disqualified, moved) do
 * not count. An entry with `left_at` set never counts either.
 *
 * Same set as supabase/functions/scheduler-generate (Deno cannot import
 * this package; keep the two in step).
 */
export const SCHEDULABLE_ENTRY_STATUSES = ["applied", "accepted", "confirmed"] as const;
export type SchedulableEntryStatus = (typeof SCHEDULABLE_ENTRY_STATUSES)[number];

export function isSchedulableEntryStatus(raw: string): raw is SchedulableEntryStatus {
  return (SCHEDULABLE_ENTRY_STATUSES as readonly string[]).includes(raw);
}
