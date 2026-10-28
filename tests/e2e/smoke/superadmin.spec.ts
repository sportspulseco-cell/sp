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

  // Guided home (doc/design/guided-ui.md): what is waiting, then the seasons.
  test("home: needs-you list and seasons", async ({ page }) => {
    await page.goto(`${E2E_URLS.superadmin}/dashboard`);
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your seasons" })).toBeVisible();
  });
});
