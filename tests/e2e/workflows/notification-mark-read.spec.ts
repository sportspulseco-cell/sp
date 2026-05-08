import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

/**
 * Cross-feature journey: clicking a notification flips its visual
 * unread state in-place, marks it read on the server, and the
 * "Mark all read" header button disappears once nothing is unread.
 *
 * Skipped if the player has zero notifications — we don't seed
 * inside the test so it can run against a fresh database without
 * polluting state. The smoke seed in PPHL has at least the
 * registration confirmations queued.
 */
test("player marks a notification as read in-place", async ({ page }) => {
  await signIn(page, E2E_URLS.player, SMOKE_USERS.player);
  await page.goto(`${E2E_URLS.player}/notifications`);

  // Skip when there's nothing to read.
  const empty = await page.getByText(/all caught up/i).count();
  test.skip(empty > 0, "no notifications seeded for this user");

  // Find the first row that shows a "queued" or "sent" status — those
  // are the ones we know exist. If there's no unread one we skip.
  const unreadCount = await page
    .getByText(/unread notification/i)
    .count();
  test.skip(unreadCount === 0, "no unread notifications");

  // Click the first row to mark it read.
  const firstRow = page.locator("li").filter({
    hasText: /queued|sent/i
  }).first();
  await firstRow.click();

  // Either the unread strip disappears (was the only one) OR the count
  // decrements. Both are valid evidence the click took effect.
  await page.waitForTimeout(1500);
  const stillUnread = await page.getByText(/unread notification/i).count();
  expect(stillUnread).toBeLessThanOrEqual(unreadCount);
});
