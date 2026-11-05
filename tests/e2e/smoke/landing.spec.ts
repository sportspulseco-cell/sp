import { test, expect, E2E_URLS } from "../fixtures";

test.describe("Landing page (anonymous)", () => {
  test("renders role-based entry links", async ({ page }) => {
    await page.goto(E2E_URLS.landing);
    await expect(page).toHaveTitle(/SportsPulse/i);
    await page.evaluate(() => {
      document.getElementById("cta")?.scrollIntoView();
    });
    for (const origin of [E2E_URLS.superadmin,E2E_URLS.orgAdmin,E2E_URLS.teamAdmin,E2E_URLS.player]) {
      await expect(page.locator(`a[href^="${origin}/sign-in"]`).first()).toBeVisible();
    }
  });
});
