import {
  test,
  expect,
  E2E_URLS,
  ROUTES,
  SMOKE_USERS,
  signIn,
  assertRouteRenders
} from "../fixtures";

test.describe("league-admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.leagueAdmin, SMOKE_USERS.leagueAdmin);
  });

  for (const route of ROUTES.leagueAdmin) {
    test(`route ${route.path} renders`, async ({ page }) => {
      await assertRouteRenders(page, E2E_URLS.leagueAdmin, route);
    });
  }

  test("dashboard shows the league count + welcome", async ({ page }) => {
    await page.goto(`${E2E_URLS.leagueAdmin}/dashboard`);
    await expect(page.getByText(/Welcome back, league admin/i)).toBeVisible();
  });
});
