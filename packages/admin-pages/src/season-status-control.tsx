"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Badge, statusTone } from "@sportspulse/ui";

const STATUSES: Array<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "draft", label: "Draft", hint: "Captains can't see it yet." },
  {
    value: "registration_open",
    label: "Registration open",
    hint: "Visible to captains while the window includes today."
  },
  {
    value: "in_progress",
    label: "In progress",
    hint: "Games are running; registration closed."
  },
  {
    value: "playoffs",
    label: "Playoffs",
    hint: "Regular season ended, playoff bracket live."
  },
  {
    value: "completed",
    label: "Completed",
    hint: "Final results in. Read-only."
  },
  { value: "archived", label: "Archived", hint: "Hidden from default lists." }
];

/**
 * Dropdown to change a season's status. Transport-agnostic — the
 * consuming app passes a `changeStatus(seasonId, status)` callback
 * that hits its own SDK binding. Used by both sa-web and
 * org-admin-web's season detail pages.
 */
export function SeasonStatusControl({
  seasonId,
  currentStatus,
  changeStatus
}: {
  seasonId: string;
  currentStatus: string;
  changeStatus: (seasonId: string, status: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(status: string) {
    if (status === currentStatus) {
      setOpen(false);
      return;
    }
    setBusy(status);
    setError(null);
    try {
      await changeStatus(seasonId, status);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-[12px] text-fg hover:border-fg-muted"
      >
        <Badge tone={statusTone(currentStatus)} mono>
          {currentStatus.replace(/_/g, " ")}
        </Badge>
        <ChevronDown className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-border bg-bg shadow-lg">
          <ul className="max-h-80 overflow-auto py-1">
            {STATUSES.map((s) => {
              const active = s.value === currentStatus;
              return (
                <li key={s.value}>
                  <button
                    type="button"
                    onClick={() => change(s.value)}
                    disabled={busy !== null}
                    className={[
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] transition disabled:opacity-50",
                      active ? "bg-accent/10 text-accent" : "hover:bg-bg-subtle"
                    ].join(" ")}
                  >
                    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                      {busy === s.value ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : active ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={2} />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <p className="font-medium text-fg">{s.label}</p>
                      <p className="text-[11px] text-fg-muted">{s.hint}</p>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="border-t border-border bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
