import { test, expect, type Page } from "@playwright/test";
import { signedInAs, IS_STAGING } from "./_helpers";

/**
 * Every admin list page has search + filters (PPHL: "filtering
 * especially"). For each page: the count line renders, picking the first
 * real option of a filter writes it to the URL and the count reacts, a
 * nonsense search shows the "no match" empty state, and clearing the
 * search keeps the chosen filter.
 */
test.skip(!IS_STAGING, "staging only");

type Check = { path: string; noun: string; filter: string };

const SUPER: Check[] = [
  { path: "/teams", noun: "teams", filter: "Organization" },
  { path: "/divisions", noun: "divisions", filter: "Season" },
  { path: "/seasons", noun: "seasons", filter: "League" },
  { path: "/leagues", noun: "leagues", filter: "Organization" },
  { path: "/organizations", noun: "organizations", filter: "Status" },
  { path: "/games", noun: "games", filter: "Season" },
  { path: "/users", noun: "users", filter: "Type" },
  { path: "/forms", noun: "forms", filter: "Organization" }
];

const ORG: Check[] = [
  { path: "/teams", noun: "teams", filter: "Status" },
  { path: "/divisions", noun: "divisions", filter: "Season" },
  { path: "/seasons", noun: "seasons", filter: "League" },
  { path: "/leagues", noun: "leagues", filter: "Status" }
];

async function exercise(page: Page, app: string, c: Check, failures: string[]) {
  const errors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500 && /staging-api/.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${app}${c.path}`);
  const count = page.getByText(new RegExp(`Showing \\d+ of \\d+ (loaded )?${c.noun}`));
  try {
    await expect(count).toBeVisible({ timeout: 20_000 });
  } catch {
    // Say what was on screen instead: a slow page, a load error and a
    // wrong page need different fixes.
    const seen = (await page.locator("main").first().innerText().catch(() => "(no main)"))
      .replace(/\s+/g, " ")
      .slice(0, 300);
    failures.push(`${c.path}: no "Showing N of M ${c.noun}" line at ${page.url()}; page showed: ${seen}`);
    return;
  }
  const before = await count.innerText();
  const total = Number(before.match(/of (\d+)/)![1]);
  const select = page.getByLabel(c.filter, { exact: true });
  const options = await select.locator("option").evaluateAll((os) =>
    os.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" }))
  );
  const pick = options.find((o) => o.value && o.value !== "none");
  if (!pick) {
    console.log(`[filters] ${c.path} ${c.filter}: no options (total ${total})`);
  } else {
    await select.selectOption(pick.value);
    await expect(page).toHaveURL(new RegExp(`[?&][a-zA-Z]+=${encodeURIComponent(pick.value)}`), { timeout: 10_000 });
    await expect(count).not.toHaveText("", { timeout: 15_000 });
    const after = await count.innerText();
    const shown = Number(after.match(/Showing (\d+)/)![1]);
    if (shown > total) failures.push(`${c.path}: filter showed ${shown} > total ${total}`);
    // Junk search: no-match empty state, filter kept.
    const search = page.getByRole("searchbox").first();
    await search.fill("zzqqxx-no-such-row");
    await expect(page.getByText(new RegExp(`Showing 0 of \\d+`))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/match these filters|No .* match/i).first()).toBeVisible();
    await search.fill("");
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(pick.value)), { timeout: 10_000 });
    await expect(select).toHaveValue(pick.value);
    console.log(`[filters] ${c.path} ${c.filter}="${pick.label.trim()}": ${before} -> ${after}`);
  }
  // Names, not ids, in every option list.
  const hexOpts = options.filter((o) => /^[0-9a-f]{8}(-|$)/i.test(o.label.trim()));
  if (hexOpts.length) failures.push(`${c.path}: ${c.filter} options show ids`);
  if (errors.length) failures.push(`${c.path}: ${errors.join(", ")}`);
}

test("superadmin list pages: search + filters", async ({ browser }) => {
  test.setTimeout(400_000);
  const { page, app, context } = await signedInAs(browser, "superAdmin");
  const failures: string[] = [];
  for (const c of SUPER) await exercise(page, app, c, failures);
  await context.close();
  expect(failures, failures.join("\n")).toEqual([]);
});

test("org-admin list pages: search + filters", async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, app, context } = await signedInAs(browser, "orgAdmin");
  const failures: string[] = [];
  for (const c of ORG) await exercise(page, app, c, failures);
  await context.close();
  expect(failures, failures.join("\n")).toEqual([]);
});
