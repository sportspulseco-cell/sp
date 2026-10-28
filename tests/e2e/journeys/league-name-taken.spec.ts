import { expect, test } from "@playwright/test";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, signedInAs, stagingSql } from "./_helpers";

/**
 * One live league per name in an organization (PPHL season re-run,
 * 27 Oct 2026). The setup wizard flags a taken name on the league step
 * and keeps "Next" closed, instead of failing after the last step.
 * Reads only: nothing is created.
 */
function wizardField(page: import("@playwright/test").Page, label: string) {
  return page
    .locator(
      `xpath=//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea]`
    )
    .first();
}

test.describe("League names are unique per organization", () => {
  test.skip(!IS_STAGING, "reads staging data");

  test("the setup wizard flags a league name the org already has", async ({ browser }) => {
    const [org] = await stagingSql<{ id: string; name: string }>(
      `select id, display_name as name from orgs where slug = 'pphl-staging'`);
    const [taken] = await stagingSql<{ name: string }>(
      `select name from leagues where org_id = $1 and status <> 'archived' and deleted_at is null order by created_at limit 1`, [org!.id]);
    expect(taken, "PPHL Staging has a live league").toBeTruthy();

    const { context, page } = await signedInAs(browser, "superAdmin");
    await page.goto(`${E2E_URLS.superadmin}/org-setup`);
    await expect(page.getByRole("heading", { name: "Which organization?" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: new RegExp(org!.name) }).click();
    await page.getByRole("button", { name: "Next: League" }).click();
    await expect(page.getByRole("heading", { name: "Which league?" })).toBeVisible();

    const name = wizardField(page, "League name");
    await name.fill(`  ${taken!.name.toUpperCase()} `);
    const msg = page.getByText("A league with this name already exists in this organization.");
    await expect(msg).toBeVisible();
    await expect(page.getByRole("button", { name: "Next: Season" })).toBeDisabled();

    await name.fill(`${taken!.name} ${Date.now()}`);
    await expect(msg).toBeHidden();
    await context.close();
  });
});
