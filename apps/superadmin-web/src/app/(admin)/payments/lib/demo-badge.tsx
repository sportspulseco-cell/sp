/**
 * Tiny pill rendered next to any UI surface backed by mock data.
 * Lets reviewers tell at a glance which numbers are real and which
 * are synthesised. Fully removed (returns null) once
 * NEXT_PUBLIC_PAYMENTS_DEMO=false is set.
 *
 * See doc/deferred-integrations.md for the deferred backlog.
 */
export function DemoBadge({ label = "demo" }: { label?: string } = {}) {
  return (
    <span
      title="Mocked for flow review — see doc/deferred-integrations.md"
      className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-700 dark:text-amber-300"
    >
      // {label}
    </span>
  );
}
