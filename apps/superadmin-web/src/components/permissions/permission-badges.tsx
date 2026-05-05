import {
  countEffectivePermissions,
  groupPermissionsByModule,
  type PermissionString
} from "@sportspulse/kernel";
import { cn } from "@/lib/utils";

/**
 * Reusable display chip group for an array of permission strings.
 *
 * Replaces the "permissions: 3" numeric column in role lists. Wildcards
 * (`*`, `<module>.*`) are expanded so the count and grouping reflect the
 * effective access — fixes the prior bug where `*` counted as 1.
 *
 * Source of truth: `@sportspulse/kernel`.
 */
export function PermissionBadges({
  permissions,
  max = 4,
  className
}: {
  permissions: readonly PermissionString[];
  /** Max number of module pills to render before collapsing into "+N more". */
  max?: number;
  className?: string;
}) {
  const total = countEffectivePermissions(permissions);

  // Special-case the root wildcard for super_admin — render a single hero pill.
  if (permissions.includes("*")) {
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
          all permissions
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fg-muted">
          {total}
        </span>
      </div>
    );
  }

  const groups = groupPermissionsByModule(permissions);
  const visible = groups.slice(0, max);
  const overflow = groups.length - visible.length;

  if (groups.length === 0) {
    return (
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-wide text-fg-muted",
          className
        )}
      >
        no permissions
      </span>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((g) => (
        <span
          key={g.module}
          title={g.codes.join(", ")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
            g.isWildcard
              ? "border-accent/30 bg-[var(--accent-soft)] text-accent"
              : "border-border bg-surface-2 text-fg-muted"
          )}
        >
          <span className="text-fg">{g.module}</span>
          <span className="tabular-nums">
            {g.isWildcard ? "all" : `${g.codes.length}`}
          </span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
          +{overflow} more
        </span>
      )}
      <span className="ml-1 font-mono text-[10px] tabular-nums text-fg-subtle">
        · {total} total
      </span>
    </div>
  );
}
