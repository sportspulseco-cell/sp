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
  dashboardState: cache(api.captain.dashboardState)
};
export const teamStore = api.teamStore;
