import "server-only";
import { createApi } from "@sportspulse/api-client";
import { apiFetch } from "./client";

const api = createApi(apiFetch);

// Re-export the SDK namespaces this app actually uses. Same pattern
// as superadmin-web — add more as the app grows.
export const iam = api.iam;
export const orgs = api.orgs;
export const leagueMgmt = api.leagueMgmt;
export const registration = api.registration;
export const roster = api.roster;
export const gameOps = api.gameOps;
export const finance = api.finance;
