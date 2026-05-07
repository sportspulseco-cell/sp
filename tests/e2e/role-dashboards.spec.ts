import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "./fixtures";

test("org admin home shows PPHL", async ({ page }) => {
  await signIn(page, E2E_URLS.orgAdmin, SMOKE_USERS.orgAdmin);
  await expect(page.getByRole("heading", { name: /PPHL/i })).toBeVisible();
  await expect(page.getByText(/Active leagues/i)).toBeVisible();
});

test("team admin home shows Boston Gold Kings", async ({ page }) => {
  await signIn(page, E2E_URLS.teamAdmin, SMOKE_USERS.teamAdmin);
  await expect(
    page.getByRole("heading", { name: /Boston Gold Kings/i })
  ).toBeVisible();
});

test("league admin overview KPIs render", async ({ page }) => {
  await signIn(page, E2E_URLS.leagueAdmin, SMOKE_USERS.leagueAdmin);
  await expect(page.getByText(/My leagues/i).first()).toBeVisible();
  // KPI: 1 league assigned to the smoke user.
  await expect(page.getByText(/^1$/).first()).toBeVisible();
});

test("super admin overview KPIs render", async ({ page }) => {
  await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
  await expect(page.getByText(/Welcome back, super admin/i)).toBeVisible();
  await expect(page.getByText(/Organizations/i).first()).toBeVisible();
});
