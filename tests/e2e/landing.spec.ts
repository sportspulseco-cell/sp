import { test, expect, E2E_URLS } from "./fixtures";

test.describe("Landing page", () => {
  test("renders + shows all 5 console cards", async ({ page }) => {
    await page.goto(E2E_URLS.landing);
    await expect(page).toHaveTitle(/SportsPulse/i);
    // Scroll to the CTA so the console cards are in view.
    await page.evaluate(() => {
      const cta = document.getElementById("cta");
      cta?.scrollIntoView();
    });
    // 5 console cards by name — order is the spec order.
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
