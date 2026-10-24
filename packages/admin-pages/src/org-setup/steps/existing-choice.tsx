"use client";

import { cn } from "@sportspulse/ui";

/**
 * "Create new" vs "Use existing" switch for Org setup steps 2 and 3
 * (SP-Changes item 2): add a season to a league that already exists, or
 * divisions to a season that already exists, instead of creating a new
 * league every time. Existing records are picked by name.
 */
export function ExistingChoice({
  newLabel,
  existingLabel,
  pickLabel,
  items,
  selectedId,
  onPick
}: {
  newLabel: string;
  existingLabel: string;
  pickLabel: string;
  items: Array<{ id: string; name: string }>;
  /** Null = "create new" is selected. */
  selectedId: string | null;
  onPick: (id: string | null) => void;
}) {
  const usingExisting = selectedId !== null;
  const tab = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-2 text-[13px] font-medium transition-colors",
      active ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-fg-muted"
    );
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tab(!usingExisting)} onClick={() => onPick(null)}>
          {newLabel}
        </button>
        <button
          type="button"
          className={tab(usingExisting)}
          onClick={() => onPick(selectedId ?? items[0]?.id ?? null)}
          disabled={items.length === 0}
        >
          {existingLabel}
        </button>
      </div>
      {usingExisting ? (
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-fg">{pickLabel}</span>
          <select
            className="input"
            value={selectedId ?? ""}
            onChange={(e) => onPick(e.target.value || null)}
            aria-label={pickLabel}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
