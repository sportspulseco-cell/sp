import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

/** The current form editor lives inside the guided setup sections. */
test("super-admin can open the guided form builder from a form's detail page", async ({
  page
}) => {
  await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
  await page.goto(`${E2E_URLS.superadmin}/forms`);

  // Click into the first form on the list. If none exist, the test
  // can't run — skip rather than fail (smoke + cascading specs cover
  // form creation already).
  const firstFormLink = page.locator("main table tbody a[href^='/forms/']").first();
  const hasAnyForm = await firstFormLink.isVisible().catch(() => false);
  test.skip(!hasAnyForm, "no forms on list to open");
  await firstFormLink.click();

  // The setup rail guides the user through each required section.
  for (const label of [
    /Season setup/i,
    /Pricing/i,
    /Divisions/i,
    /Form builder/i,
    /Email templates/i,
    /Review & publish/i
  ]) {
    await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
  }

  await page.getByRole("link", { name: /Form builder/i }).first().click();
  await expect(page).toHaveURL(/\/forms\/[^/]+\?section=form_builder$/);
  await expect(
    page.getByText("Custom questions", { exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Add question|Edit as new draft/i })
      .first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish/i })).toBeVisible();
});
