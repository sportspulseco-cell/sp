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

  // Guided home: explicit season choice, followed by one working season.
  test("home shows the organization and lets staff choose one season", async ({ page }) => {
    await page.goto(E2E_URLS.orgAdmin);
    await expect(page.getByRole("heading", { name: /PPHL/i, level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByText("Which season are you working on?", { exact: true })).toBeVisible();
    const picker = page.getByRole("combobox", { name: "League and season" });
    await expect(picker).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
    await picker.click();
    const seasons = page.getByRole("listbox");
    await expect(seasons).toHaveAttribute("id", await picker.getAttribute("aria-controls") ?? "");
    // The header's native organization select also exposes option roles.
    await seasons.getByRole("option").first().click();
    await expect(page).toHaveURL(/season=/);
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.getByRole("main").getByText("Other season tasks", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("article")).toHaveCount(1);
  });

});
