import type { FormVersion } from "@sportspulse/api-client";

/**
 * Version picking that never depends on the order the API lists versions
 * in. The superadmin API lists newest first; the org-admin API listed them
 * in table order, so `versions.find((v) => !v.locked)` on the Review step
 * published the oldest autosave draft ("Untitled question") over the
 * version the admin had just published from the Form builder (staging,
 * 4 Nov 2026, season "Winter 2026 dzwkt").
 */

/** The newest version by number: an open draft to edit, or the live version, locked. */
export function newestFormVersion(versions: readonly FormVersion[]): FormVersion | null {
  let best: FormVersion | null = null;
  for (const v of versions) {
    if (!best || v.versionNumber > best.versionNumber) best = v;
  }
  return best;
}

/**
 * The newest unpublished draft that is newer than the live version, or
 * null when the live version is already the latest. Older drafts are the
 * autosaves that led up to the live version and must never go live again.
 */
export function publishableDraft(
  versions: readonly FormVersion[],
  activeVersionId: string | null
): FormVersion | null {
  const live = activeVersionId ? versions.find((v) => v.id === activeVersionId) ?? null : null;
  const floor = live?.versionNumber ?? 0;
  let best: FormVersion | null = null;
  for (const v of versions) {
    if (v.locked || v.versionNumber <= floor) continue;
    if (!best || v.versionNumber > best.versionNumber) best = v;
  }
  return best;
}

/** True when two versions carry the same questions and waivers. */
export function sameFormSchema(a: FormVersion | null, b: FormVersion | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a.schema) === JSON.stringify(b.schema);
}
