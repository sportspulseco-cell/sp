import { ShieldAlert, UserPlus } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type { FreeAgentPoolEntry, Season } from "@sportspulse/api-client";
import { iam, leagueMgmt, registrationV2 } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { FreeAgentForm } from "./free-agent-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Join free-agent pool — SportsPulse" };

/**
 * Player-side entry point to advertise themselves to captains. Backend
 * (registrationV2.upsertFreeAgentEntry) is already open for self-write
 * via @AllowScopedWrite — we just need a UI.
 *
 * The form upserts by (playerPersonId, seasonId), so editing a prior
 * entry overwrites in place. If the player already has a 'placed'
 * entry we render a status banner instead of the form.
 */
export default async function FreeAgentPoolPage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;
  const orgId = scope?.orgIds[0] ?? null;

  if (!personId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Find a team" title="Join the free-agent pool" />
        <EmptyState
          icon={ShieldAlert}
          title="Finish onboarding first"
          description="We need a person record linked to your account before you can advertise yourself to captains."
        />
      </div>
    );
  }

  // Pull the seasons the player can register for (org-scoped). Free-agent
  // pool only makes sense while a season is open or running — surface
  // those, hide draft / completed / archived.
  const seasonsPage = orgId
    ? await leagueMgmt
        .listSeasons({ orgId })
        .catch(() => ({ items: [] as Season[], nextCursor: null }))
    : { items: [] as Season[], nextCursor: null };

  const eligibleSeasons: Season[] = (seasonsPage.items ?? [])
    .filter((s) => s.status === "registration_open" || s.status === "in_progress")
    .slice()
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

  if (eligibleSeasons.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Find a team" title="Join the free-agent pool" />
        <EmptyState
          icon={UserPlus}
          title="No open seasons right now"
          description="Captains can only see free agents for active seasons. Check back when registration opens."
        />
      </div>
    );
  }

  // Pull existing entries — we use the first eligible season as the
  // default and pre-populate from any matching entry the player has.
  const raw = await registrationV2
    .listFreeAgentPool({})
    .catch(() => [] as FreeAgentPoolEntry[]);
  const entries: FreeAgentPoolEntry[] = Array.isArray(raw)
    ? raw
    : ((raw as unknown as { items?: FreeAgentPoolEntry[] }).items ?? []);
  const myEntries = entries.filter((e) => e.playerPersonId === personId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Find a team"
        title="Join the free-agent pool"
        description="Advertise yourself to captains in the seasons you'd play. Captains browse the pool by position + level."
      />
      <FreeAgentForm
        personId={personId}
        seasons={eligibleSeasons}
        existingEntries={myEntries}
      />
    </div>
  );
}
