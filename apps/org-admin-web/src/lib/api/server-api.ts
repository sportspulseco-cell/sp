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
export const communications = api.communications;
export const audit = api.audit;
export const orgAdminTeams = api.orgAdminTeams;
export const orgAdminRefundAssessments = api.orgAdminRefundAssessments;
export const orgAdminLeagues = api.orgAdminLeagues;
export const orgAdminSeasons = api.orgAdminSeasons;
export const orgAdminDivisions = api.orgAdminDivisions;
export const orgAdminBroadcast = api.orgAdminBroadcast;
export const orgAdminFinance = api.orgAdminFinance;
export const orgAdminRegistrations = api.orgAdminRegistrations;
export const orgAdminForms = api.orgAdminForms;
// Forms-builder shared package needs registrationV2 for the
// pricing-tier + email-template fetches (BUG-043). The apiFetch
// wrapper rewrites these paths to /org-admin/* proxies.
export const registrationV2 = api.registrationV2;
