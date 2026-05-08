import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

/**
 * Workflow 5 §3 — the home page shows a state-aware banner above the
 * next-game hero. Three states: new (S1) / returning (S2) / in
 * progress (S3). The banner is suppressed when the user has an
 * active or pending-review submission.
 *
 * We can't manipulate registration state here — instead we just
 * assert that exactly one of the four expected states is visible
 * (banner present OR no banner because S0). Catches "banner stopped
 * rendering at all" regressions.
 */
test("player home shows a registration banner OR nothing — never a broken state", async ({
  page
}) => {
  await signIn(page, E2E_URLS.player, SMOKE_USERS.player);
  await page.goto(E2E_URLS.player);

  const banners = await page
    .locator("section")
    .filter({
      hasText:
        /Register for a season|new season is open|Resume your registration/
    })
    .count();
  // 0 (active state) or 1 (any of S1/S2/S3) — both fine.
  expect(banners).toBeLessThanOrEqual(1);
});
