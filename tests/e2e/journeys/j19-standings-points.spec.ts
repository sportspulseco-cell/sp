import { stagingDbUrl } from "./_helpers";
/**
 * J19 · Standings points per division (FR-3.13.1)
 *
 * The admin opens a division, edits Standings points to 3-2-1-0 in the
 * Edit division dialog, sees them on the division page without a reload,
 * and the division row stores them. A wrong number (11) is refused in
 * words. Setup: a throwaway season and division (labelled, removed).
 * The rule reaching standings is proven by verify-standings.mjs (db).
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH } from "../../../playwright.config";

const IS_STAGING = process.env.E2E_TARGET === "staging";
const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;

let sqlClient: ((q: string, p?: unknown[]) => Promise<any[]>) | null = null;
let sqlEnd: (() => Promise<void>) | null = null;
async function stagingSql<T = Record<string, any>>(q: string, params: unknown[] = []): Promise<T[]> {
  if (!sqlClient) {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    const f = resolve(".env.local");
    if (existsSync(f)) {
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i < 1 || line.startsWith("#")) continue;
        env[line.slice(0, i)] ??= line.slice(i + 1).replace(/^"|"$/g, "");
      }
    }
    const postgres = createRequire(resolve("packages/db/package.json"))("postgres");
    const sql = postgres(stagingDbUrl(env), { max: 1, ssl: "require", prepare: false });
    sqlClient = (qq, p = []) => sql.unsafe(qq, p as any[]);
    sqlEnd = () => sql.end();
  }
  return (await sqlClient(q, params)) as T[];
}

test.describe("J19 standings points", () => {
  test.skip(!IS_STAGING, "J19 mutates data; staging only");
  test.setTimeout(300_000);

  test("J19 journey: edit division points → shown and stored", async ({ browser }) => {
    const tag = `${RUN_TAG}J19`;
    let seasonId = "";
    let divisionId = "";
    try {
      const [lg] = await stagingSql(`select id, org_id, sport_code from leagues where name = 'PPHL Staging League' limit 1`);
      const [s] = await stagingSql(
        `insert into seasons (league_id, org_id, name, sport_code, start_date, end_date, timezone, status)
         values ($1, $2, $3, $4, '2027-01-04', '2027-04-30', 'America/New_York', 'in_progress') returning id`,
        [lg.id, lg.org_id, `${tag} Season`, lg.sport_code]);
      seasonId = s.id;
      const [d] = await stagingSql(`insert into divisions (season_id, name) values ($1, $2) returning id`, [seasonId, `${tag} Div`]);
      divisionId = d.id;

      const ctx = await browser.newContext(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
      const page = await ctx.newPage();
      await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
      await page.goto(`${E2E_URLS.superadmin}/divisions/${divisionId}`);
      await expect(page.getByText("Default points. Edit the division to change them.")).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: "Edit division" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("Points per win").fill("11");
      await dlg.getByRole("button", { name: "Save division" }).click();
      await expect(dlg.getByText("Points per win must be a whole number from 0 to 10.")).toBeVisible();

      await dlg.getByLabel("Points per win").fill("3");
      await dlg.getByLabel("Points per overtime or shootout win").fill("2");
      await dlg.getByLabel("Points per loss").fill("0");
      await dlg.getByLabel("Points per overtime or shootout loss").fill("1");
      await dlg.getByLabel("Points per tie").fill("1");
      await dlg.getByRole("button", { name: "Save division" }).click();
      await expect(dlg).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText("Set for this division.")).toBeVisible({ timeout: 20_000 });

      const [row] = await stagingSql(`select rule_set_overrides->'pointsRule' p from divisions where id = $1`, [divisionId]);
      expect(row?.p, "db: division stores 3-2-1-0").toEqual({ win: 3, overtimeWin: 2, loss: 0, overtimeLoss: 1, tie: 1 });
      await ctx.close();
    } finally {
      if (divisionId) await stagingSql(`delete from divisions where id = $1`, [divisionId]).catch(() => {});
      if (seasonId) await stagingSql(`delete from seasons where id = $1`, [seasonId]).catch(() => {});
      await sqlEnd?.();
    }
  });
});
