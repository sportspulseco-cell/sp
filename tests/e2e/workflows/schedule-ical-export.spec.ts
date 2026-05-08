import {
  test,
  expect,
  E2E_URLS,
  SMOKE_USERS,
  signIn
} from "../fixtures";

/**
 * Player schedule iCal export — clicking "Add to calendar" triggers
 * a download of a .ics file. We intercept the download and assert
 * the bytes look like a valid VCALENDAR.
 *
 * Skipped if the team has zero scheduled games (button is disabled
 * in that case).
 */
test("player can download .ics schedule", async ({ page }) => {
  await signIn(page, E2E_URLS.player, SMOKE_USERS.player);
  await page.goto(`${E2E_URLS.player}/schedule`);

  const button = page.getByRole("button", { name: /Add to calendar/i });
  await expect(button).toBeVisible();

  const isDisabled = await button.isDisabled();
  test.skip(isDisabled, "no games to export");

  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await button.click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/sportspulse-.*\.ics$/i);

  // Read the bytes (small file, fits in memory) and assert iCal shape.
  const stream = await download.createReadStream();
  if (!stream) throw new Error("download stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8");
  expect(text).toContain("BEGIN:VCALENDAR");
  expect(text).toContain("END:VCALENDAR");
  expect(text).toMatch(/PRODID:.*SportsPulse/i);
});
