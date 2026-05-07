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

  const [pricingTiers, emailTemplates, divisions] = await Promise.all([
    registrationV2.listPricingTiers({ seasonId: id }).catch(() => []),
    registrationV2.listEmailTemplates({ seasonId: id }).catch(() => []),
    league.listDivisions({ seasonId: id }).catch(() => ({ items: [] }))
  ]);

  return (
    <SeasonSetupShell
      season={season}
      initialPricingTiers={pricingTiers}
      initialEmailTemplates={emailTemplates}
      divisions={divisions.items ?? []}
    />
  );
}
