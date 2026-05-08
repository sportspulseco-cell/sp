import {
  test,
  expect,
  E2E_URLS,
  ROUTES,
  SMOKE_USERS,
  signIn,
  assertRouteRenders
} from "../fixtures";

test.describe("super-admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
  });

  for (const route of ROUTES.superadmin) {
    test(`route ${route.path} renders`, async ({ page }) => {
      await assertRouteRenders(page, E2E_URLS.superadmin, route);
    });
  }

  test("dashboard KPIs visible", async ({ page }) => {
    await page.goto(`${E2E_URLS.superadmin}/dashboard`);
    await expect(page.getByText(/Welcome back, super admin/i)).toBeVisible();
    await expect(page.getByText(/Organizations/i).first()).toBeVisible();
    await expect(page.getByText(/Active leagues/i).first()).toBeVisible();
  });
});
