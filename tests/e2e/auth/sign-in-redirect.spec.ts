import { test, expect, E2E_URLS } from "../fixtures";

/**
 * Anonymous users hitting any protected route get redirected to the
 * app's /sign-in. This catches regressions in the per-app middleware
 * that gate the dashboard tree on auth + role + profile completion.
 */
const PROTECTED: Array<{ name: string; url: string; path: string }> = [
  { name: "super-admin", url: E2E_URLS.superadmin, path: "/dashboard" },
  { name: "league-admin", url: E2E_URLS.leagueAdmin, path: "/dashboard" },
  { name: "org-admin", url: E2E_URLS.orgAdmin, path: "/" },
  { name: "team-admin", url: E2E_URLS.teamAdmin, path: "/" },
  { name: "player", url: E2E_URLS.player, path: "/" }
];

for (const t of PROTECTED) {
  test(`${t.name}: anonymous user is redirected to /sign-in`, async ({
    page
  }) => {
    await page.goto(`${t.url}${t.path}`);
    // Either the middleware redirects to /sign-in OR the page renders
    // a sign-in form inline. Both are acceptable signals that the
    // route is gated.
    await page.waitForLoadState("domcontentloaded");
    const url = new URL(page.url());
    const onSignInUrl = url.pathname.startsWith("/sign-in");
    if (!onSignInUrl) {
      // Acceptable fallback: page rendered the sign-in form anyway.
      await expect(page.locator("input[type='email']").first()).toBeVisible();
      await expect(
        page.locator("input[type='password']").first()
      ).toBeVisible();
    }
  });
}
