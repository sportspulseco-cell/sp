import { test as base, type Page, expect } from "@playwright/test";
import { E2E_URLS } from "../../playwright.config";

/**
 * Smoke users — created by .playwright-mcp/create-smoke-users.py.
 * Re-running that script rotates the password; keep this constant
 * in lockstep with the script's PASSWORD value.
 */
export const SMOKE_PASSWORD = "SmokeTest!2026";

export const SMOKE_USERS = {
  superAdmin: "sportspulse.smoketest+sa@gmail.com",
  // League admin smoke user retained — they now sign in to
  // superadmin-web (P5-D, 2026-05-15) and see a league-scoped filter.
  leagueAdmin: "sportspulse.smoketest+la@gmail.com",
  orgAdmin: "sportspulse.smoketest+oa@gmail.com",
  teamAdmin: "sportspulse.smoketest+ta@gmail.com",
  player: "sportspulse.smoketest+pl@gmail.com"
} as const;

/**
 * Route catalogs per app — drives the smoke layer. Each entry asserts
 * a `path` (relative to the app's base URL) + an `anchor` (a substring
 * or RegExp that proves the page rendered, distinct from the chrome
 * which is identical across pages). When a new page lands, add it
 * here AND its app's smoke spec — that's the contract.
 *
 * Anchors are "rendered something specific to this page", not full
 * data assertions, so smoke catches "page broke" cleanly without
 * coupling to seed data.
 */
export interface RouteCheck {
  path: string;
  anchor: RegExp | string;
}

export const ROUTES = {
  superadmin: [
    { path: "/dashboard", anchor: /Welcome back/i },
    { path: "/organizations", anchor: /Organizations/i },
    { path: "/users", anchor: /Users/i },
    { path: "/persons", anchor: /Persons/i },
    { path: "/roles", anchor: /Roles/i },
    { path: "/audit", anchor: /Audit/i },
    { path: "/seasons", anchor: /Seasons/i },
    { path: "/leagues", anchor: /Leagues/i },
    { path: "/divisions", anchor: /Divisions/i },
    { path: "/teams", anchor: /Teams/i },
    { path: "/rosters", anchor: /Memberships/i },
    { path: "/registrations", anchor: /Registrations/i },
    { path: "/forms", anchor: /Registration forms/i },
    { path: "/finance", anchor: /Finance/i },
    { path: "/finance/ar", anchor: /AR Dashboard/i }
  ] as RouteCheck[],

  orgAdmin: [
    { path: "/", anchor: /organization/i },
    { path: "/leagues", anchor: /Leagues/i },
    { path: "/seasons", anchor: /Seasons/i },
    { path: "/divisions", anchor: /Divisions/i },
    { path: "/teams", anchor: /Teams/i },
    { path: "/registrations", anchor: /Registrations/i },
    { path: "/forms", anchor: /super-admin form builder|Registration forms/i },
    { path: "/finance", anchor: /Finance/i }
  ] as RouteCheck[],

  teamAdmin: [
    { path: "/", anchor: /Roster|Team/i },
    { path: "/roster", anchor: /Roster/i },
    { path: "/schedule", anchor: /Schedule/i },
    { path: "/lineups", anchor: /Lineups|Coming soon/i },
    { path: "/stats", anchor: /Stats/i },
    { path: "/comms", anchor: /Communications|Coming soon/i }
  ] as RouteCheck[],

  player: [
    { path: "/", anchor: /Hey /i },
    { path: "/schedule", anchor: /Schedule/i },
    { path: "/stats", anchor: /Stats/i },
    { path: "/video", anchor: /Video|Coming soon/i },
    { path: "/team", anchor: /Roster|Team/i },
    { path: "/store", anchor: /Team store|Coming soon/i },
    { path: "/payments", anchor: /Payments/i },
    { path: "/compliance", anchor: /Compliance/i },
    { path: "/notifications", anchor: /Notifications/i },
    { path: "/profile", anchor: /Profile|Coming soon/i }
  ] as RouteCheck[],

  /**
   * Player routes that only exist when the user holds the captain
   * role. Visited on the dual-role smoke run (Parker after promote).
   */
  playerCaptain: [
    { path: "/captain/team", anchor: /Manage team/i },
    { path: "/captain/roster", anchor: /Manage roster|Empty roster/i },
    { path: "/captain/invites", anchor: /Invites/i },
    { path: "/captain/free-agents", anchor: /Free agents/i }
  ] as RouteCheck[]
} as const;

export { E2E_URLS };

/**
 * Sign in helper. Hits the app's /sign-in page, fills the email +
 * password, clicks submit, waits for the redirect away from /sign-in.
 * Each app's SignInForm has the same shape (one email input, one
 * password input, one submit) so this helper works across all five.
 */
export async function signIn(
  page: Page,
  appUrl: string,
  email: string,
  password: string = SMOKE_PASSWORD
) {
  await page.goto(`${appUrl}/sign-in`);
  await page.locator("input[type='email']").fill(email);
  await page.locator("input[type='password']").fill(password);
  await page.locator("button[type='submit']").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
    timeout: 30_000
  });
}

/**
 * Visit a route and assert its anchor renders. Used by the smoke
 * layer to walk every page in an app's catalog.
 */
export async function assertRouteRenders(
  page: Page,
  appUrl: string,
  check: RouteCheck
) {
  const target = `${appUrl}${check.path}`;
  await page.goto(target);
  await expect(page.getByText(check.anchor).first()).toBeVisible({
    timeout: 15_000
  });
}

/**
 * Assert a route is BLOCKED for the current session — either the
 * middleware redirected to /sign-in, or the page rendered a "not
 * authorized / captain role required" empty state rather than the
 * protected content.
 */
export async function assertRouteBlocked(
  page: Page,
  appUrl: string,
  path: string,
  forbiddenAnchor?: RegExp
) {
  await page.goto(`${appUrl}${path}`);
  const url = new URL(page.url());
  if (url.pathname.startsWith("/sign-in")) return; // redirect = blocked
  if (forbiddenAnchor) {
    await expect(page.getByText(forbiddenAnchor).first()).toBeVisible();
  }
}

export const test = base;
export { expect };
