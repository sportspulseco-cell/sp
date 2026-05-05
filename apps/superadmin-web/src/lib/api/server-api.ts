import "server-only";
import { apiFetch } from "./client";
import { createApi } from "./sdk";

const api = createApi(apiFetch);

// Re-export the same shape as before so server components import these directly.
export const iam = api.iam;
export const orgs = api.orgs;
export const leagueMgmt = api.leagueMgmt;
export const registration = api.registration;
export const roster = api.roster;
export const gameOps = api.gameOps;
export const stats = api.stats;
export const compliance = api.compliance;
export const communications = api.communications;
export const audit = api.audit;
export const finance = api.finance;
export const admin = api.admin;
export const crossOrgGrants = api.crossOrgGrants;
export const dataMigration = api.dataMigration;
export const registrationV2 = api.registrationV2;
// Alias for cleaner read in season-setup pages.
export const league = api.leagueMgmt;
