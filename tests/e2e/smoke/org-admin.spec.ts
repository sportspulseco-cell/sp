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

  // Guided home (doc/design/guided-ui.md): org name, what is waiting, the seasons.
  test("home shows the org name, needs-you list and seasons", async ({ page }) => {
    await page.goto(E2E_URLS.orgAdmin);
    await expect(page.getByRole("heading", { name: /PPHL/i, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your seasons" })).toBeVisible();
  });

});
