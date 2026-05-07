import { test as base, type Page } from "@playwright/test";
import { E2E_URLS } from "../../playwright.config";

/**
 * Smoke users (created via .playwright-mcp/create-smoke-users.py).
 * Re-running that script rotates the password; keep this constant in
 * lockstep with the script's PASSWORD value.
 */
export const SMOKE_PASSWORD = "SmokeTest!2026";

export const SMOKE_USERS = {
  superAdmin: "sportspulse.smoketest+sa@gmail.com",
  leagueAdmin: "sportspulse.smoketest+la@gmail.com",
  orgAdmin: "sportspulse.smoketest+oa@gmail.com",
  teamAdmin: "sportspulse.smoketest+ta@gmail.com",
  player: "sportspulse.smoketest+pl@gmail.com"
} as const;

export { E2E_URLS };

/**
 * Sign in helper. Hits the app's /sign-in page, fills the standard
 * email/password form, clicks submit, and waits for the redirect.
 * Each app's sign-in form is the SignInForm shipped with the app —
 * shape is consistent (input[type=email] + input[type=password] +
 * the only submit button).
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
  // Successful sign-in redirects away from /sign-in. Wait for that.
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
    timeout: 30_000
  });
}

export const test = base;
export { expect } from "@playwright/test";
