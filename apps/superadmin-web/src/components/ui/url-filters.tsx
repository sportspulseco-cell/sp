"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export interface UrlFilterSelect {
  /** Query-string key, e.g. "status". */
  param: string;
  label: string;
  /** Text of the empty option, e.g. "All statuses". */
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * Search box + dropdown filters kept in the URL query string, so a
 * filtered list survives reload and can be shared. The server page reads
 * the same params and does the filtering. Used by /users and /forms.
 */
export function UrlFilters({
  searchParam = "q",
  searchPlaceholder,
  selects
}: {
  searchParam?: string;
  searchPlaceholder: string;
  selects: UrlFilterSelect[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get(searchParam) ?? "");

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  }

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(searchParam) ?? "") !== q) set(searchParam, q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select =
    "h-9 rounded-md border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 w-full rounded-md border border-border bg-bg pl-8 pr-3 text-[13px] text-fg outline-none focus:border-accent"
        />
      </label>
      {selects.map((s) => (
        <select
          key={s.param}
          aria-label={s.label}
          className={select}
          value={params.get(s.param) ?? ""}
          onChange={(e) => set(s.param, e.target.value)}
        >
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
