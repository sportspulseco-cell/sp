import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

/**
 * Form-builder version wizard — the bug that motivated this spec:
 * clicking a form name on /forms used to land on a detail page with
 * no path to create a draft or version. SP Mocks specced a 5-step
 * wizard (info → fields → eligibility → notifications → review) that
 * now lives at /forms/[id]/versions/new.
 *
 * This spec walks the wizard's primary surfaces without publishing —
 * publishing would pollute registration_form_versions on the live
 * deploy. The mutation suite owns the publish path.
 */
test("super-admin can open the version wizard from a form's detail page", async ({
  page
}) => {
  await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
  await page.goto(`${E2E_URLS.superadmin}/forms`);

  // Click into the first form on the list. If none exist, the test
  // can't run — skip rather than fail (smoke + cascading specs cover
  // form creation already).
  const firstFormLink = page.getByRole("link", { name: /form/i }).first();
  const hasAnyForm = await firstFormLink.isVisible().catch(() => false);
  test.skip(!hasAnyForm, "no forms on list to open");
  await firstFormLink.click();

  // Detail page should expose the wizard entry — either the header
  // "Create version" button or the empty-state "Create first version"
  // CTA.
  const createButton = page
    .getByRole("link", { name: /Create (first )?version/i })
    .first();
  await expect(createButton).toBeVisible();
  await createButton.click();
  await expect(page).toHaveURL(/\/forms\/[^/]+\/versions\/new$/);

  // Topbar contract: form name + DRAFT v{n} pill + scope badge +
  // action triplet (Save draft / Preview / Publish).
  await expect(page.getByText(/DRAFT v\d+/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save draft/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Preview$/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Publish version/i })
  ).toBeVisible();

  // Sidebar contract: 5 steps, "Form info" active by default.
  for (const label of [
    /Form info/i,
    /Form fields/i,
    /Eligibility/i,
    /Notifications/i,
    /Review/i
  ]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }

  // Form fields step — schema editor + question-count badge.
  await page.getByText(/Form fields/i).first().click();
  await expect(page.getByText(/QUESTIONS?/i).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add question/i })
  ).toBeVisible();

  // Review step — FormRenderer preview should mount even with zero
  // fields, and the validate footer should report empty-but-valid.
  await page.getByText(/Review/i).first().click();
  await expect(
    page.getByText(/Schema validates|Add at least one|Ready to publish/i)
  ).toBeVisible();
});
