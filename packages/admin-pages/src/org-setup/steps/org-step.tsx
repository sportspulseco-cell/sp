"use client";

import { useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import type { Org } from "@sportspulse/api-client";
import { cn } from "@sportspulse/ui";

/**
 * Phase 0 — Select organization. The single-select list maps directly
 * to leagues.orgId (FK locked once the league is created in Phase 1).
 */
export function OrgStep({
  orgs,
  selectedId,
  onSelect,
  renderCreateOrg
}: {
  orgs: Org[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Super admin only: renders the create-organization form; the callback
   * closes it. Omitted (org-admin console) = no "New organization" option.
   */
  renderCreateOrg?: (close: () => void) => ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Organization"
        hint="All orgs you have access to"
      />

      {renderCreateOrg ? (
        creating ? (
          renderCreateOrg(() => setCreating(false))
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-surface-1 px-4 py-3 text-left text-[14px] font-medium text-fg transition-colors hover:border-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-bg-subtle">
              <Plus className="h-4 w-4" strokeWidth={2} />
            </span>
            New organization
            <span className="ml-auto font-mono text-[11px] text-fg-muted">create it and choose its org admin</span>
          </button>
        )
      ) : null}

      <ul className="space-y-2">
        {orgs.map((o) => {
          const selected = o.id === selectedId;
          const initials = (o.displayName ?? o.legalName ?? "??")
            .split(/\s+/)
            .map((s) => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onSelect(o.id)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-xl border bg-surface-1 px-4 py-3 text-left transition-colors",
                  selected
                    ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                    : "border-border hover:border-fg-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-semibold",
                    selected ? "bg-accent text-bg" : "bg-bg-subtle text-fg"
                  )}
                >
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-fg">
                    {o.displayName ?? o.legalName}
                  </span>
                  <span className="block font-mono text-[11px] text-fg-muted">
                    {o.orgType.replace(/_/g, " ")}
                    {o.countryCode ? ` · ${o.countryCode}` : ""}
                    {o.defaultCurrency ? ` · ${o.defaultCurrency}` : ""}
                    {o.defaultTimezone ? ` · ${o.defaultTimezone}` : ""}
                  </span>
                </span>
                {selected ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-bg">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                    Selected
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Section divider with optional required/optional chip. Tokens only:
 * required uses --tint-rose-* (the canonical caution pair), optional
 * uses bg-bg-subtle text-fg-muted. No hardcoded Tailwind hues.
 */
export function SectionHeader({
  title,
  hint,
  required,
  optional
}: {
  title: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
      <div>
        <p className="text-[14px] font-semibold tracking-tight text-fg">{title}</p>
        {hint ? (
          <p className="mt-0.5 font-mono text-[11px] text-fg-muted">{hint}</p>
        ) : null}
      </div>
      {required ? (
        <span className="rounded-full bg-[var(--tint-rose-bg)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-rose-fg)]">
          Required
        </span>
      ) : optional ? (
        <span className="rounded-full border border-border bg-bg-subtle px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Optional
        </span>
      ) : null}
    </div>
  );
}
