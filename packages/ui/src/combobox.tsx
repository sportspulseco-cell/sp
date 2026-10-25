"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./lib/cn";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line, e.g. an entry status. Searched too. */
  hint?: string;
}

/**
 * Type-ahead picker for an entity (team, person, rink): type part of a
 * name, pick from the matches. Use instead of a long <select> or a raw
 * id field. The caller passes the complete option list (fetch every page
 * first); matching is case-insensitive on label and hint.
 *
 * Accessible: the input is a combobox (`id` goes on the input, so a
 * wrapping <Field label> names it), options are role="option" in a
 * listbox. Arrow keys move, Enter picks, Escape closes without picking.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Type a name",
  disabled,
  emptyText = "Nothing matches",
  maxShown = 50,
  className
}: {
  id?: string;
  options: ComboboxOption[];
  /** Selected option value, "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shown when the typed text matches nothing. */
  emptyText?: string;
  /** Cap on rows rendered; the rest are reached by typing more. */
  maxShown?: number;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-listbox`;
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show the picked label whenever the selection changes from outside.
  useEffect(() => {
    if (!open) setQuery(selected?.label ?? "");
  }, [selected?.label, open]);

  const typed = open && query !== (selected?.label ?? "") ? query.trim().toLowerCase() : "";
  const matches = useMemo(() => {
    const list = typed
      ? options.filter(
          (o) => o.label.toLowerCase().includes(typed) || (o.hint ?? "").toLowerCase().includes(typed)
        )
      : options;
    return list;
  }, [options, typed]);
  const shown = matches.slice(0, maxShown);

  function pick(o: ComboboxOption) {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]!);
      }
    } else if (e.key === "Escape") {
      if (open) {
        // Close the list only; keep the dialog that holds it open.
        e.stopPropagation();
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            setOpen(false);
            setQuery(selected?.label ?? "");
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "flex h-9 w-full rounded-md border border-border bg-surface-1 pl-3 pr-9 text-sm text-fg placeholder:text-fg-muted",
            "transition-colors duration-fast ease-ease",
            "focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      </div>
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-1 py-1 shadow-md"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-fg-muted">
              {typed ? `${emptyText} "${query.trim()}".` : emptyText}
            </li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                // Pick on mousedown so the input's blur does not close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "cursor-pointer px-3 py-1.5 text-sm",
                  i === active ? "bg-surface-2 text-fg" : "text-fg",
                  o.value === value ? "font-medium" : ""
                )}
              >
                {o.label}
                {o.hint ? <span className="ml-2 text-[12px] text-fg-muted">{o.hint}</span> : null}
              </li>
            ))
          )}
          {matches.length > shown.length ? (
            <li className="px-3 py-1.5 text-[12px] text-fg-muted">
              {matches.length - shown.length} more. Type more of the name to narrow.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
