import {
  test,
  expect,
  E2E_URLS,
  ROUTES,
  SMOKE_USERS,
  signIn,
  assertRouteRenders
} from "../fixtures";

test.describe("org-admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.orgAdmin, SMOKE_USERS.orgAdmin);
  });

  for (const route of ROUTES.orgAdmin) {
    test(`route ${route.path} renders`, async ({ page }) => {
      await assertRouteRenders(page, E2E_URLS.orgAdmin, route);
    });
  }

  test("home shows the user's org name + KPI cards", async ({ page }) => {
    await page.goto(E2E_URLS.orgAdmin);
    await expect(page.getByRole("heading", { name: /PPHL/i })).toBeVisible();
    await expect(page.getByText(/Active leagues/i).first()).toBeVisible();
    await expect(page.getByText(/Outstanding AR/i).first()).toBeVisible();
  });

});
