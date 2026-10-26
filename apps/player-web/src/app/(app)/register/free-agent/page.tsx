import { fetchAll, load } from "@sportspulse/api-client";
import { ShieldAlert, UserPlus } from "lucide-react";
import { EmptyState, LoadError } from "@sportspulse/ui";
import type { FreeAgentPoolEntry, Season } from "@sportspulse/api-client";
import { leagueMgmt, loadMeScope, registrationV2 } from "@/lib/api/server-api";
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
  const scope = await loadMeScope();
  const personId = scope?.personId ?? null;
  const orgId = scope?.orgIds[0] ?? null;

  if (!personId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Find a team" title="Join the free-agent pool" />
        <EmptyState
          icon={ShieldAlert}
          title="Finish onboarding first"
          description="We need a person record linked to your account before you can advertise yourself to captains."
        />
      </div>
    );
  }

  // Pull the seasons the player can register for. When the player has
  // an org scope (because they've registered for at least one season
  // already), narrow via the authenticated listSeasons. When they
  // don't — fresh sign-up clicking "Join free-agent pool" — the
  // AuthorizedAccessGuard rejects listSeasons with 403. Fall back to
  // the anonymous /public/registration/open endpoint so the player
  // has somewhere to start.
  let eligibleSeasons: Season[] = [];
  if (orgId) {
    const seasonsPage = await fetchAll((cursor) => leagueMgmt
      .listSeasons({ orgId, limit: 100, cursor }))
      .catch(() => ({ items: [] as Season[], nextCursor: null }));
    eligibleSeasons = (seasonsPage.items ?? [])
      .filter(
        (s) => s.status === "registration_open" || s.status === "in_progress"
      )
      .slice()
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  } else {
    // Player has no org reach yet (fresh sign-up). The authenticated
    // /open-for-me endpoint correctly returns an empty list for them —
    // they need to come through a captain's invite URL or an org-issued
    // public link, not a global directory. Fall through to the
    // EmptyState below.
  }

  if (eligibleSeasons.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Find a team" title="Join the free-agent pool" />
        <EmptyState
          icon={UserPlus}
          title="No open seasons right now"
          description="Captains can only see free agents for active seasons. Check back when registration opens."
        />
      </div>
    );
  }

  // The player's own entries (any season, any status) pre-fill the form
  // and mark placed seasons. The pool list itself is for captains and
  // admins; asking it without a season was refused and swallowed, so the
  // form always looked new (CAP-17).
  const mine = await load(registrationV2.listMyFreeAgentEntries());
  if (!mine.ok) {
    return <LoadError what="your free-agent entries" status={mine.status} message={mine.message} />;
  }
  const myEntries: FreeAgentPoolEntry[] = mine.data.filter((e) => e.playerPersonId === personId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Find a team"
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
