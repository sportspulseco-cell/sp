import { notFound } from "next/navigation";
import { league, registrationV2 } from "@/lib/api/server-api";
import { SeasonSetupShell } from "@/components/registrations/season-setup-shell";

/**
 * Tabbed Season Setup wizard — Registration Module v2 §3.
 * Six tabs are always accessible. Sections auto-save on blur. Sequential
 * order is enforced only at publish time.
 */
export default async function SeasonSetupPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const season = await league.getSeason(id).catch(() => null);
  if (!season) notFound();

  // Sibling seasons in the same league — drive the TopBar switcher so
  // the admin can change which season they're configuring without
  // bouncing back to /seasons. (Tester feedback: "the seasons have
  // already been created in org setup. It should just be a drop-down.")
  const [pricingTiers, emailTemplates, divisions, sameLeagueSeasons] =
    await Promise.all([
      registrationV2.listPricingTiers({ seasonId: id }).catch(() => []),
      registrationV2.listEmailTemplates({ seasonId: id }).catch(() => []),
      league.listDivisions({ seasonId: id }).catch(() => ({ items: [] })),
      league
        .listSeasons({ leagueId: season.leagueId })
        .catch(() => ({ items: [], nextCursor: null }))
    ]);

  return (
    <SeasonSetupShell
      season={season}
      initialPricingTiers={pricingTiers}
      initialEmailTemplates={emailTemplates}
      divisions={divisions.items ?? []}
      availableSeasons={sameLeagueSeasons.items.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status
      }))}
    />
  );
}
