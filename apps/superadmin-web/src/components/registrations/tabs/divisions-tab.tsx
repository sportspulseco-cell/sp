"use client";

import type { Division, Season } from "@/lib/api/types";

export function DivisionsTab({
  divisions,
  season
}: {
  divisions: Division[];
  season: Season;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
          // 03 · Divisions
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
          Divisions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Divisions tied to this season's leagues. Wave 1 surfaces the list;
          age range and level constraints come in Wave 2.
        </p>
      </header>

      {divisions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center">
          <p className="text-[14px] text-fg-muted">
            No divisions configured for this season yet. Add them via the{" "}
            <span className="font-mono">Divisions</span> page in the main
            sidebar.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {divisions.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between border-b border-border px-5 py-3 last:border-b-0"
            >
              <div>
                <p className="text-[14px] font-medium tracking-tight text-fg">
                  {d.name}
                </p>
                <p className="font-mono text-[11px] text-fg-muted">
                  {d.tier ?? "—"} · {d.genderEligibility} · {d.status}
                </p>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                {d.id.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
