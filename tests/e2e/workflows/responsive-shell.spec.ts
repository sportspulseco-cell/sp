import { test, expect, E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";

const workspaces = [
  { name: "superadmin", base: E2E_URLS.superadmin, email: SMOKE_USERS.superAdmin, path: "/organizations" },
  { name: "organization", base: E2E_URLS.orgAdmin, email: SMOKE_USERS.orgAdmin, path: "/seasons" },
  { name: "team", base: E2E_URLS.teamAdmin, email: SMOKE_USERS.teamAdmin, path: "/roster" },
  { name: "player", base: E2E_URLS.player, email: SMOKE_USERS.player, path: "/schedule" }
] as const;

for (const workspace of workspaces) {
  test(`${workspace.name} workspace fits mobile and tablet widths`, async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, workspace.base, workspace.email);
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${workspace.base}${workspace.path}`);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `${workspace.name} root overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
}
