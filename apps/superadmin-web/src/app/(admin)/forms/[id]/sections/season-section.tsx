import type { RegistrationForm, Season } from "@sportspulse/api-client";
import { leagueMgmt } from "@/lib/api/server-api";
import { SeasonSectionForm } from "./season-section-form";

/**
 * Server entry — pulls prior seasons in the same org for the rollover
 * card. Wraps the client form that owns inputs + save mutations.
 */
export async function SeasonSection({
  form,
  season
}: {
  form: RegistrationForm;
  season: Season | null;
}) {
  const priorSeasonsPage = await leagueMgmt
    .listSeasons({ orgId: form.orgId })
    .catch(() => ({ items: [] as Season[], nextCursor: null }));

  // Filter out the season this form is currently bound to (if any).
  const priorSeasons = priorSeasonsPage.items
    .filter((s) => s.id !== form.seasonId)
    .slice(0, 5);

  return (
    <SeasonSectionForm form={form} season={season} priorSeasons={priorSeasons} />
  );
}
