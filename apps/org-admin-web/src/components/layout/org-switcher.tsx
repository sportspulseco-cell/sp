"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { setActiveOrgId } from "@/lib/active-org-action";

type Org = { id: string; displayName: string };

/**
 * Org-switcher dropdown for federation-style users scoped to 2+
 * orgs. Hidden entirely when scope has 0 or 1 orgs — single-org
 * admins see no chrome. Selection persists via cookie + the
 * server action triggers a path revalidate so every list refetches
 * filtered to the new active org.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId
}: {
  orgs: Org[];
  activeOrgId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (orgs.length < 2) return null;

  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  return (
    <label className="relative inline-flex items-center gap-2">
      <span className="sr-only">Active organisation</span>
      <span className="pointer-events-none inline-flex items-center gap-1.5 text-fg-muted">
        <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <select
        value={activeOrgId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setActiveOrgId(next);
            router.refresh();
          });
        }}
        className="appearance-none rounded-md border border-border bg-bg-subtle py-1.5 pl-2 pr-8 text-[12px] font-medium text-fg focus:border-accent focus:outline-none"
        aria-label="Active organisation"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.displayName}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-fg-muted"
        strokeWidth={1.75}
      />
      {active && pending ? (
        <span className="sr-only">Switching to {active.displayName}…</span>
      ) : null}
    </label>
  );
}
