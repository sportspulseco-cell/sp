"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Combobox, Field, type ComboboxOption } from "@sportspulse/ui";

/** The URL keeps the operator's explicit choice through refresh and Back. */
export function SeasonWorkspacePicker({ options, value }: { options: ComboboxOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <div className="max-w-xl space-y-2" aria-busy={pending}>
      <Field label="League and season" htmlFor="workspace-season">
        <Combobox
          id="workspace-season"
          options={options}
          value={value}
          disabled={pending}
          placeholder="Find a league or season"
          emptyText="No matching season"
          onChange={(id) => {
            if (id === value) return;
            const next = new URLSearchParams(search.toString());
            next.set("season", id);
            next.delete("gamesAfter");
            next.delete("view");
            startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }));
          }}
        />
      </Field>
      <p role="status" className="min-h-5 text-[13px] text-fg-muted">{pending ? "Opening season…" : ""}</p>
    </div>
  );
}
