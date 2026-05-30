"use client";

import { Check } from "lucide-react";
import type { Org } from "@sportspulse/api-client";
import { cn } from "@sportspulse/ui";

/**
 * Phase 0 — Select organisation. The single-select list maps directly
 * to leagues.orgId (FK locked once the league is created in Phase 1).
 */
export function OrgStep({
  orgs,
  selectedId,
  onSelect
}: {
  orgs: Org[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Organisation"
        hint="All orgs you have access to"
      />

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
