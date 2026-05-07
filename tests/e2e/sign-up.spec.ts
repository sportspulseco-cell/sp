import { test, expect, E2E_URLS } from "./fixtures";

/**
 * Multi-step sign-up funnel renders on every app.
 * We don't run the full account-creation E2E here (that would
 * pollute the auth.users table) — just verify the funnel's first
 * step is reachable and the stepper is present.
 */
const APPS: Array<{ name: string; url: string; copy: string }> = [
  { name: "Super Admin", url: E2E_URLS.superadmin, copy: "Super Admin" },
  { name: "League Admin", url: E2E_URLS.leagueAdmin, copy: "League Admin" },
  { name: "Org Admin", url: E2E_URLS.orgAdmin, copy: "Org Admin" },
  { name: "Team Admin", url: E2E_URLS.teamAdmin, copy: "Team Admin" },
  { name: "Player", url: E2E_URLS.player, copy: "Player" }
];

for (const app of APPS) {
  test(`sign-up funnel renders on ${app.name}`, async ({ page }) => {
    await page.goto(`${app.url}/sign-up`);
    await expect(page.getByText(/Step 1 of 4/i)).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Join SportsPulse — ${app.copy}`, "i"))
    ).toBeVisible();
    // The "Get started" CTA scrolls into step 2.
    await page.getByRole("button", { name: /Get started/i }).click();
    await expect(page.getByText(/Step 2 of 4/i)).toBeVisible();
    await expect(page.getByLabel(/Work email/i)).toBeVisible();
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
  });
}
