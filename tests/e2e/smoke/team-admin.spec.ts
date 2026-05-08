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

  test("home shows the user's team", async ({ page }) => {
    await page.goto(E2E_URLS.teamAdmin);
    await expect(
      page.getByRole("heading", { name: /Boston Gold Kings/i })
    ).toBeVisible();
  });

  test("topbar role-line reflects team_admin", async ({ page }) => {
    await page.goto(E2E_URLS.teamAdmin);
    await expect(page.getByText(/team_admin/i).first()).toBeVisible();
  });
});
