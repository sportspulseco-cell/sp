import {
  test,
  expect,
  E2E_URLS,
  ROUTES,
  SMOKE_USERS,
  signIn,
  assertRouteRenders
} from "../fixtures";

test.describe("team-admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.teamAdmin, SMOKE_USERS.teamAdmin);
  });

  for (const route of ROUTES.teamAdmin) {
    test(`route ${route.path} renders`, async ({ page }) => {
      await assertRouteRenders(page, E2E_URLS.teamAdmin, route);
    });
  }

  test("home shows the current team", async ({ page }) => {
    await page.goto(E2E_URLS.teamAdmin);
    await expect(page.locator("main h1")).toBeVisible();
  });

  test("topbar shows the current team role", async ({ page }) => {
    await page.goto(E2E_URLS.teamAdmin);
    await expect(page.locator("header").getByText(/captain|team admin/i).first()).toBeVisible();
  });
});
