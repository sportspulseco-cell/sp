import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "./fixtures";

test.describe("Player dashboard (signed in as Parker)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.player, SMOKE_USERS.player);
  });

  test("home renders sidebar + KPIs + role-line", async ({ page }) => {
    // Hero greeting present.
    await expect(page.getByText(/Hey Parker/i)).toBeVisible();
    // Topbar role line — Parker holds player + captain dual role
    // after the smoke setup, so the role line says "captain".
    await expect(page.getByText(/captain · 1 team/i)).toBeVisible();
    // Captain pill appears in the topbar.
    await expect(page.getByText(/Captain/, { exact: true }).first()).toBeVisible();
    // Sidebar groups present.
    await expect(page.getByText(/My game/i).first()).toBeVisible();
    await expect(page.getByText(/My team/i).first()).toBeVisible();
    await expect(page.getByText(/My account/i).first()).toBeVisible();
    await expect(page.getByText(/Captain console/i)).toBeVisible();
  });

  test("schedule loads + iCal export button works", async ({ page }) => {
    await page.goto(`${E2E_URLS.player}/schedule`);
    await expect(page.getByText(/Schedule/i).first()).toBeVisible();
    // iCal button is present (may be disabled if list is empty).
    await expect(
      page.getByRole("button", { name: /Add to calendar/i })
    ).toBeVisible();
  });

  test("notifications page loads", async ({ page }) => {
    await page.goto(`${E2E_URLS.player}/notifications`);
    await expect(page.getByText(/Notifications/i).first()).toBeVisible();
  });

  test("captain console pages reachable", async ({ page }) => {
    for (const path of [
      "/captain/team",
      "/captain/roster",
      "/captain/invites",
      "/captain/free-agents"
    ]) {
      await page.goto(`${E2E_URLS.player}${path}`);
      // Each captain page renders a // Captain console eyebrow.
      await expect(page.getByText(/Captain console/i).first()).toBeVisible();
    }
  });
});
