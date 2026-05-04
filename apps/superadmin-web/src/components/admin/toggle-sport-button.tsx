"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { admin } from "@/lib/api/browser-api";
import type { Sport } from "@/lib/api/types";

export function ToggleSportButton({ sport }: { sport: Sport }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = !sport.active;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await admin.updateSport(sport.code, { active: next });
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
      className="rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          ...
        </span>
      ) : next ? (
        "Activate"
      ) : (
        "Deactivate"
      )}
    </button>
  );
}
