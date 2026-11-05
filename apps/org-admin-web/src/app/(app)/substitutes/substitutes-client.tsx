"use client";
import { useMemo } from "react";
import { RegionalSubStaffQueue } from "@sportspulse/admin-pages";
import { subs } from "@/lib/api/browser-api";
export function SubstitutesClient({ orgId }: { orgId: string }) {
  const api = useMemo(() => ({ regionalPending: (cursor?: string) => subs.regionalPending(cursor, orgId), reviewRegional: subs.reviewRegional }), [orgId]);
  return <RegionalSubStaffQueue api={api} />;
}
