import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

/**
 * Form-builder regression — the bug that motivated the cascading
 * scope picker: scope=Division required scopeId; without it the
 * server returned 422.
 *
 * This test only verifies the UI: scope=Division-specific surfaces
 * League / Season / Division dropdowns. It does NOT submit (would
 * pollute registration_forms) — separate mutation suite owns that.
 */
test("super-admin form builder shows cascading pickers when scope=division", async ({
  page
}) => {
  await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
  await page.goto(`${E2E_URLS.superadmin}/forms`);
  await page.locator("header").getByRole("button", { name: /New form/i }).click();

  // Dialog opens. With several orgs and no org filter nothing is
  // preselected (CAP-23); the league picker waits for an org.
  await expect(page.getByLabel(/^Scope$/i)).toBeVisible();
  const org = page.getByLabel(/^Organization$/i);
  if (await org.isVisible()) {
    expect(await org.inputValue(), "no org preselected").toBe("");
    await org.selectOption({ index: 1 });
  }
  // A season-registration form asks for its league and season (REG-20).
  await expect(page.getByLabel(/^Purpose$/i)).toHaveValue("season_registration");
  await expect(page.getByLabel(/^League$/i)).toBeVisible();
  // Any other purpose at Org-wide scope hides the pickers.
  await page.getByLabel(/^Purpose$/i).selectOption("custom");
  await expect(page.getByLabel(/^League$/i)).toBeHidden();

  await page.getByLabel(/^Scope$/i).selectOption("Division-specific");

  // League picker becomes visible immediately. Season + Division
  // appear only after a league is picked, which we don't do here —
  // the regression is about the absence of any picker, not the
  // chain order.
  await expect(page.getByLabel(/^League$/i)).toBeVisible();
});
