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

  // Guided home (doc/design/guided-ui.md): "Needs you" (tasks, or one
  // "all set" line), the next game, recent games. Totals live on their
  // own pages.
  test("home: needs-you list, next game and recent games render", async ({ page }) => {
    await page.goto(E2E_URLS.player);
    await expect(page.getByText(/Hey /i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
    // Next-game hero (always present, even when empty).
    await expect(page.getByText(/Next game/i).first()).toBeVisible();
    await expect(page.getByText("Recent games", { exact: false }).first()).toBeVisible();
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
    await expect(page.getByRole("heading", { name: /Waivers & documents/i })).toBeVisible();
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

});
