import "server-only";
import { cache } from "react";
import { createApi } from "@sportspulse/api-client";
import { apiFetch } from "./client";

const api = createApi(apiFetch);

// Re-export the SDK namespaces this app actually uses. Same pattern
// as superadmin-web — add more as the app grows.
export const iam = {
  ...api.iam,
  me: cache(api.iam.me),
  meScope: cache(api.iam.meScope)
};

/**
 * The caller's scope for this request. One retry, then the error is
 * thrown so the page shows its error screen. Pages used to catch a
 * failure as `null` and render "no org" / "captain role required" /
 * "No leagues yet" when the data was there and only the call had failed.
 */
export const loadMeScope = cache(async () => {
  try {
    return await api.iam.meScope();
  } catch (first) {
    console.error("[scope] meScope failed, retrying once", first);
    return await api.iam.meScope();
  }
});
export const orgs = api.orgs;
export const leagueMgmt = api.leagueMgmt;
export const registration = api.registration;
export const roster = api.roster;
export const gameOps = api.gameOps;
export const finance = api.finance;
export const communications = api.communications;
export const stats = api.stats;
export const compliance = api.compliance;
export const registrationV2 = api.registrationV2;
export const captain = {
  ...api.captain,
  dashboardState: cache(api.captain.dashboardState),
  // Layout (banner + sidebar CTA) and the home / register pages read
  // these in the same request; one fetch each.
  openSeasons: cache(api.captain.openSeasons),
  myApplications: cache(api.captain.myApplications)
};
export const teamStore = api.teamStore;
// Substitute requests (UC-31).
export const subs = api.subs;
