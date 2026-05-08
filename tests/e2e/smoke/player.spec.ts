import {
  test,
  expect,
  E2E_URLS,
  ROUTES,
  SMOKE_USERS,
  signIn,
  assertRouteRenders
} from "../fixtures";

test.describe("player smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.player, SMOKE_USERS.player);
  });

  for (const route of ROUTES.player) {
    test(`route ${route.path} renders`, async ({ page }) => {
      await assertRouteRenders(page, E2E_URLS.player, route);
    });
  }

  test("home: hero + KPI tiles + 4 home sections render", async ({ page }) => {
    await page.goto(E2E_URLS.player);
    await expect(page.getByText(/Hey /i)).toBeVisible();
    // Next-game hero (always present, even when empty).
    await expect(page.getByText(/Next game/i).first()).toBeVisible();
    // 4 KPI labels.
    for (const k of [
      "Games played",
      "Team record",
      "Upcoming games",
      "Balance due"
    ]) {
      await expect(page.getByText(k, { exact: false }).first()).toBeVisible();
    }
    // 4 home sections.
    for (const s of [
      "Recent games",
      "My registrations",
      "Payments",
      "Notifications"
    ]) {
      await expect(page.getByText(s, { exact: false }).first()).toBeVisible();
    }
  });

  test("schedule: filter pills + iCal export button visible", async ({
    page
  }) => {
    await page.goto(`${E2E_URLS.player}/schedule`);
    for (const pill of ["all", "upcoming", "completed"]) {
      await expect(
        page.getByRole("link", { name: new RegExp(`^${pill}$`, "i") })
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: /Add to calendar/i })
    ).toBeVisible();
  });

  test("compliance: status banner present", async ({ page }) => {
    await page.goto(`${E2E_URLS.player}/compliance`);
    await expect(page.getByText(/Compliance/i).first()).toBeVisible();
    // Either a banner or the empty-state.
    const all = page.getByText(/All clear|need|requirements yet|attention/i);
    await expect(all.first()).toBeVisible();
  });
});

test.describe("player + captain (Parker holds dual role)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E_URLS.player, SMOKE_USERS.player);
  });

  test("captain pill rendered in topbar", async ({ page }) => {
    await page.goto(E2E_URLS.player);
    await expect(page.getByText(/Captain/, { exact: true }).first()).toBeVisible();
  });

  for (const route of ROUTES.playerCaptain) {
    test(`captain route ${route.path} renders`, async ({ page }) => {
      await assertRouteRenders(page, E2E_URLS.player, route);
    });
  }
});
