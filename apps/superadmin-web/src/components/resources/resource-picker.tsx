"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import type { ScopeType } from "@sportspulse/kernel";
import { orgs, leagueMgmt } from "@/lib/api/browser-api";

type ResourceScope = Exclude<ScopeType, "platform" | "game">;

interface Option {
  id: string;
  label: string;
  sub?: string;
}

/**
 * Searchable resource picker for org / league / season / division / team.
 *
 * Replaces the "paste a UUID" input wherever an admin needs to point at a
 * scope. Drop in by passing `scopeType` and the current `value` (id) — the
 * picker will fetch + cache the matching list and render a dropdown with
 * inline search. Same component used by the global Invite User button and
 * any future scope-bound form.
 */
export function ResourcePicker({
  scopeType,
  value,
  onChange,
  placeholder
}: {
  scopeType: ResourceScope;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Fetch the resource list when the dropdown opens, once per scope type.
  useEffect(() => {
    if (!open || options.length > 0 || loading) return;
    setLoading(true);
    setError(null);
    fetchOptions(scopeType)
      .then((rows) => setOptions(rows))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, scopeType, options.length, loading]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.sub ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const selected = options.find((o) => o.id === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-surface-1 px-3 text-left text-sm text-fg transition-colors duration-fast hover:border-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
      >
        <span className="truncate">
          {selected ? (
            <>
              <span>{selected.label}</span>
              {selected.sub && (
                <span className="ml-2 font-mono text-[10px] text-fg-muted">
                  {selected.sub}
                </span>
              )}
            </>
          ) : value ? (
            <span className="font-mono text-[12px] text-fg-muted">
              {value.slice(0, 8)}…
            </span>
          ) : (
            <span className="text-fg-muted">
              {placeholder ?? `Pick a ${scopeType}…`}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-fg-muted hover:text-fg"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-fg-muted" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2">
            <Search className="h-3.5 w-3.5 text-fg-muted" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${scopeType}s by name or id…`}
              className="flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-muted focus:outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-[13px] text-fg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading {scopeType}s…
              </div>
            )}
            {!loading && error && (
              <div className="px-3 py-3 text-[13px] text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="px-3 py-3 text-[13px] text-fg-muted">
                No matches.
              </div>
            )}
            {!loading &&
              !error &&
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={
                    o.id === value
                      ? "flex w-full items-center justify-between gap-3 bg-accent/10 px-3 py-2 text-left text-[13px] text-fg"
                      : "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] text-fg hover:bg-surface-2"
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.sub && (
                      <span className="block truncate font-mono text-[10px] text-fg-muted">
                        {o.sub}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] text-fg-muted">
                    {o.id.slice(0, 8)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchOptions(scope: ResourceScope): Promise<Option[]> {
  switch (scope) {
    case "org": {
      const page = await orgs.list({ limit: 100 });
      return page.items.map((o) => ({
        id: o.id,
        label: o.displayName ?? o.legalName,
        sub: o.slug
      }));
    }
    case "league": {
      const page = await leagueMgmt.listLeagues({});
      return page.items.map((l) => ({
        id: l.id,
        label: l.name,
        sub: `${l.sportCode}${l.format ? ` · ${l.format}` : ""}`
      }));
    }
    case "season": {
      const page = await leagueMgmt.listSeasons({});
      return page.items.map((s) => ({
        id: s.id,
        label: s.name,
        sub: `${s.sportCode} · ${s.startDate} → ${s.endDate}`
      }));
    }
    case "division": {
      const page = await leagueMgmt.listDivisions({});
      return page.items.map((d) => ({
        id: d.id,
        label: d.name,
        sub: d.tier ?? undefined
      }));
    }
    case "team": {
      const page = await leagueMgmt.listTeams({});
      return page.items.map((t) => ({
        id: t.id,
        label: t.name,
        sub: t.sportCode
      }));
    }
  }
}
