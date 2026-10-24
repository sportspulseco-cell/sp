import "server-only";
import { captain } from "@/lib/api/server-api";
import {
  deriveRegistrationCall,
  type RegistrationCall
} from "./registration-call";

type DashboardState = Awaited<ReturnType<typeof captain.dashboardState>>;

/**
 * Server-side read for the registration call-to-action. Both SDK calls
 * are wrapped in React `cache()` in server-api.ts, so the layout and
 * the page share one fetch per request.
 *
 * When the open-seasons read fails but the dashboard already says the
 * window is open, fall back to that so the CTA does not vanish on a
 * transient error.
 */
export async function loadRegistrationCall(
  teamId: string,
  state: DashboardState | null
): Promise<RegistrationCall | null> {
  const [openSeasons, applications] = await Promise.all([
    captain.openSeasons(teamId).catch(() => null),
    captain.myApplications(teamId).catch(() => null)
  ]);
  const call = deriveRegistrationCall({
    openSeasons: openSeasons?.items ?? [],
    applications: applications?.items ?? []
  });
  if (call) return call;
  if (
    !openSeasons &&
    state?.mode === "registration_open" &&
    state.seasonId &&
    state.seasonName
  ) {
    return {
      kind: "open",
      openCount: 1,
      seasonId: state.seasonId,
      seasonName: state.seasonName,
      leagueName: state.leagueName ?? "",
      registrationClosesAt: state.registrationClosesAt
    };
  }
  return null;
}
