import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

test("landing to every role workspace in one browser journey", async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto(E2E_URLS.landing);
  for (const origin of [
    E2E_URLS.superadmin,
    E2E_URLS.league,
    E2E_URLS.orgAdmin,
    E2E_URLS.teamAdmin,
    E2E_URLS.player
  ]) {
    await expect(page.locator(`a[href^="${origin}/sign-in"]`).first()).toBeVisible();
  }

  const workspaces = [
    { name: "superadmin", base: E2E_URLS.superadmin, email: SMOKE_USERS.superAdmin, path: "/organizations", anchor: /Organizations/i },
    { name: "league", base: E2E_URLS.league, email: SMOKE_USERS.leagueAdmin, path: "/leagues", anchor: /Leagues/i },
    { name: "organization", base: E2E_URLS.orgAdmin, email: SMOKE_USERS.orgAdmin, path: "/seasons", anchor: /Seasons/i },
    { name: "team", base: E2E_URLS.teamAdmin, email: SMOKE_USERS.teamAdmin, path: "/roster", anchor: /Roster/i },
    { name: "player", base: E2E_URLS.player, email: SMOKE_USERS.player, path: "/schedule", anchor: /Schedule/i }
  ] as const;

  for (const workspace of workspaces) {
    await test.step(workspace.name, async () => {
      const signInStarted = Date.now();
      await signIn(page, workspace.base, workspace.email);
      const routeStarted = Date.now();
      const response = await page.goto(`${workspace.base}${workspace.path}`);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByText(workspace.anchor).first()).toBeVisible();
      if (process.env.E2E_CAPTURE_UI === "1") {
        await page.screenshot({ path: `test-results/${workspace.name}-workspace.png` });
      }
      console.log(`${workspace.name}: sign-in ${Date.now() - signInStarted}ms, deep route ${Date.now() - routeStarted}ms`);
    });
  }
});
