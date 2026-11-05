"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Shield } from "lucide-react";
import { setActiveTeamId } from "@/lib/active-team-action";

type TeamOption = { id: string; name: string };

/**
 * Team switcher for a captain or coach with two or more teams. Hidden
 * with one team. The pick is kept in a cookie and the pages reload with
 * that team (same pattern as the org console's organization switcher).
 */
export function TeamSwitcher({ teams, activeTeamId }: { teams: TeamOption[]; activeTeamId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (teams.length < 2) return null;
  const active = teams.find((t) => t.id === activeTeamId) ?? teams[0];

  return (
    <label className="relative inline-flex min-w-0 items-center gap-2">
      <span className="sr-only">Team</span>
      <span className="pointer-events-none inline-flex items-center gap-1.5 text-fg-muted">
        <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <select
        value={activeTeamId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setActiveTeamId(next);
            router.refresh();
          });
        }}
        className="max-w-28 appearance-none truncate rounded-md border border-border bg-bg-subtle py-1.5 pl-2 pr-8 text-[12px] font-medium text-fg focus:border-accent focus:outline-none sm:max-w-56"
        aria-label="Team"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      {active && pending ? <span className="sr-only">Switching to {active.name}…</span> : null}
    </label>
  );
}
