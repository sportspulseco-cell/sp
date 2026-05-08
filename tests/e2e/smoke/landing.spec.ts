import { test, expect, E2E_URLS } from "../fixtures";

test.describe("Landing page (anonymous)", () => {
  test("renders + 5 console cards visible", async ({ page }) => {
    await page.goto(E2E_URLS.landing);
    await expect(page).toHaveTitle(/SportsPulse/i);
    await page.evaluate(() => {
      document.getElementById("cta")?.scrollIntoView();
    });
    for (const name of [
      "Super Admin",
      "Org Admin",
      "League Admin",
      "Team Admin",
      "Player"
    ]) {
      await expect(
        page.getByText(name, { exact: false }).first()
      ).toBeVisible();
    }
  });
});
