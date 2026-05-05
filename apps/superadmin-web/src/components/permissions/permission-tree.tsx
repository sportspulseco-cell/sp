"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PERMISSION_GROUPS,
  type PermissionString
} from "@sportspulse/kernel";
import { cn } from "@/lib/utils";

/**
 * Reusable permission picker with module-grouped checkboxes.
 *
 * Designed to drop into:
 *   - Create / edit role forms (custom roles)
 *   - System role detail (read-only mode via `readOnly`)
 *   - Future audit / impersonation flows that need a permission diff
 *
 * Source of truth is `@sportspulse/kernel` — never inline permission
 * strings here. If a new permission is needed, add it to the kernel
 * catalogue, not to this component.
 */
export function PermissionTree({
  value,
  onChange,
  readOnly = false,
  showRootWildcard = false
}: {
  /** Selected permissions, may include wildcards (`*`, `<module>.*`). */
  value: PermissionString[];
  /** Called whenever the selection changes (omit when `readOnly`). */
  onChange?: (next: PermissionString[]) => void;
  readOnly?: boolean;
  /** Show the top-level "all permissions" (`*`) toggle — only meaningful for super_admin. */
  showRootWildcard?: boolean;
}) {
  const selected = useMemo(() => new Set(value), [value]);
  const hasRoot = selected.has("*");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggleExpanded(module: string) {
    setExpanded((e) => ({ ...e, [module]: !e[module] }));
  }

  function commit(next: Set<PermissionString>) {
    if (!onChange) return;
    onChange(Array.from(next));
  }

  function toggleRoot() {
    if (readOnly) return;
    const next = new Set(selected);
    if (hasRoot) next.delete("*");
    else next.add("*");
    commit(next);
  }

  function toggleModule(module: string) {
    if (readOnly) return;
    const wildcard = `${module}.*`;
    const next = new Set(selected);
    if (next.has(wildcard)) {
      next.delete(wildcard);
    } else {
      // Adding the wildcard supersedes any per-action selection in this module.
      const group = PERMISSION_GROUPS.find((g) => g.module === module);
      if (group) {
        for (const p of group.permissions) next.delete(p.code);
      }
      next.add(wildcard);
    }
    commit(next);
  }

  function togglePermission(code: PermissionString, module: string) {
    if (readOnly) return;
    const next = new Set(selected);
    const wildcard = `${module}.*`;
    if (next.has(wildcard)) {
      // User picked a single action while wildcard was on — explode the wildcard.
      const group = PERMISSION_GROUPS.find((g) => g.module === module);
      next.delete(wildcard);
      if (group) for (const p of group.permissions) next.add(p.code);
      next.delete(code);
    } else if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    commit(next);
  }

  function isModuleAll(module: string): boolean {
    if (hasRoot) return true;
    if (selected.has(`${module}.*`)) return true;
    const group = PERMISSION_GROUPS.find((g) => g.module === module);
    if (!group) return false;
    return group.permissions.every((p) => selected.has(p.code));
  }

  function isModulePartial(module: string): boolean {
    if (hasRoot || selected.has(`${module}.*`)) return false;
    const group = PERMISSION_GROUPS.find((g) => g.module === module);
    if (!group) return false;
    const matched = group.permissions.filter((p) => selected.has(p.code)).length;
    return matched > 0 && matched < group.permissions.length;
  }

  function isPermissionSelected(code: PermissionString, module: string): boolean {
    if (hasRoot) return true;
    if (selected.has(`${module}.*`)) return true;
    return selected.has(code);
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-subtle">
      {showRootWildcard && (
        <RootRow
          checked={hasRoot}
          onToggle={toggleRoot}
          readOnly={readOnly}
        />
      )}

      <ul className="divide-y divide-border">
        {PERMISSION_GROUPS.map((g) => {
          const all = isModuleAll(g.module);
          const partial = isModulePartial(g.module);
          const isExpanded = expanded[g.module] ?? false;
          return (
            <li
              key={g.module}
              className={cn(
                "transition-colors",
                hasRoot && "opacity-50"
              )}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(g.module)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-fg-muted transition-transform",
                    isExpanded && "rotate-0",
                    !isExpanded && "-rotate-90"
                  )}
                  strokeWidth={2}
                />
                <Checkbox
                  checked={all}
                  indeterminate={partial}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleModule(g.module);
                  }}
                  disabled={readOnly || hasRoot}
                />
                <span className="flex-1 text-[13px] font-medium tracking-tight text-fg">
                  {g.label}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  {all
                    ? "all"
                    : partial
                      ? `${
                          g.permissions.filter((p) => selected.has(p.code))
                            .length
                        } / ${g.permissions.length}`
                      : `${g.permissions.length} actions`}
                </span>
              </button>

              {isExpanded && (
                <ul className="space-y-0 border-t border-border bg-bg pb-1.5 pt-1.5">
                  {g.permissions.map((p) => {
                    const checked = isPermissionSelected(p.code, p.module);
                    return (
                      <li
                        key={p.code}
                        className="flex items-start gap-2.5 px-9 py-1.5 transition-colors hover:bg-surface-2"
                      >
                        <Checkbox
                          checked={checked}
                          onChange={(e) => {
                            e.stopPropagation();
                            togglePermission(p.code, p.module);
                          }}
                          disabled={readOnly || hasRoot}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[11px] tracking-tight text-fg">
                            {p.code}
                          </p>
                          <p className="text-[11px] text-fg-muted">
                            {p.description}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RootRow({
  checked,
  onToggle,
  readOnly
}: {
  checked: boolean;
  onToggle: () => void;
  readOnly: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={readOnly}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border bg-bg-elev px-3 py-2 text-left transition-colors",
        !readOnly && "hover:bg-surface-2",
        readOnly && "cursor-not-allowed opacity-60"
      )}
    >
      <Checkbox checked={checked} onChange={() => {}} disabled={readOnly} />
      <span className="flex-1 text-[13px] font-medium tracking-tight text-fg">
        All permissions (super_admin only)
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {checked ? "ALL" : "—"}
      </span>
    </button>
  );
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.MouseEvent | React.ChangeEvent) => void;
  disabled?: boolean;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onChange(e);
      }}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
        checked || indeterminate
          ? "border-accent bg-accent"
          : "border-border bg-surface-1",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {checked && !indeterminate && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-accent-fg">
          <path
            d="M2.5 6.5l2.5 2.5L9.5 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {indeterminate && (
        <span className="block h-0.5 w-2 rounded-full bg-accent-fg" />
      )}
    </span>
  );
}
