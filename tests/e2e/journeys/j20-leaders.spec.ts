import { stagingDbUrl } from "./_helpers";
/**
 * J20 · Season leaders and standings on every console (FR-3.5.3)
 *
 * Read-only on staging data. The league admin (superadmin-web
 * /stats?tab=leaderboards), the captain (team-admin-web /stats) and the
 * player (player-web /stats) each see Points / Goals / Assists leaders
 * for their division's season. The top points leader shown is checked
 * against the database: sum of stat lines of finalized games only.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Browser } from "@playwright/test";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH } from "../../../playwright.config";

const IS_STAGING = process.env.E2E_TARGET === "staging";
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
async function open(browser: Browser, app: string, email: string, path: string) {
  const ctx = await browser.newContext(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
  const page = await ctx.newPage();
  await signIn(page, app, email);
  await page.goto(`${app}${path}`);
  return { ctx, page };
}

test.describe("J20 season leaders", () => {
  test.skip(!IS_STAGING, "J20 reads staging data");
  test.setTimeout(300_000);
  test.afterAll(async () => { await sqlEnd?.(); });

  test("J20 journey: leaders on admin, captain and player consoles", async ({ browser }) => {
    // The captain's team, its current division and season (db).
    const [ctx] = await stagingSql<{ team_id: string; division_id: string; season_id: string; league_id: string }>(
      `select e.team_id, e.division_id, d.season_id, s.league_id
         from division_team_entries e
         join divisions d on d.id = e.division_id
         join seasons s on s.id = d.season_id
         join teams t on t.id = e.team_id
        where t.name = 'Staging Skaters' and e.left_at is null and e.entry_status in ('applied','accepted','confirmed')
        order by s.start_date desc limit 1`);
    test.skip(!ctx, "Staging Skaters is not entered in a division");
    const [leader] = await stagingSql<{ name: string; pts: number }>(
      `select coalesce(p.preferred_name, p.legal_first_name || ' ' || p.legal_last_name) name, sum((sl.core->>'points')::int)::int pts
         from stat_lines sl join games g on g.id = sl.game_id join persons p on p.id = sl.person_id
        where sl.season_id = $1 and sl.division_id = $2 and g.status in ('completed','forfeited')
        group by 1 having sum((sl.core->>'points')::int) > 0 order by 2 desc, 1 limit 1`, [ctx!.season_id, ctx!.division_id]);
    console.log(`[J20] db top points leader: ${JSON.stringify(leader)}`);

    const cap = await open(browser, E2E_URLS.teamAdmin, SMOKE_USERS.teamAdmin, "/stats");
    await expect(cap.page.getByRole("list", { name: "Points leaders" }).or(cap.page.getByText("No points yet.")).first()).toBeVisible({ timeout: 30_000 });
    if (leader) await expect(cap.page.getByRole("list", { name: "Points leaders" }).locator("li").first(), "captain sees the db's top scorer").toContainText(leader.name);
    await cap.ctx.close();

    const pl = await open(browser, E2E_URLS.player, SMOKE_USERS.player, "/stats");
    await expect(pl.page.getByRole("heading", { name: /Points leaders/ }).first(), "player sees leaders").toBeVisible({ timeout: 30_000 });
    await expect(pl.page.getByRole("table", { name: /^Standings / }).or(pl.page.getByText("No finalized games yet.")).first(), "player sees team standings").toBeVisible();
    await pl.ctx.close();

    const la = await open(browser, E2E_URLS.league, SMOKE_USERS.leagueAdmin, `/stats?tab=leaderboards&leagueId=${ctx!.league_id}`);
    await expect(la.page.getByText(/finalized games only/).first(), "league admin sees the season's leaders").toBeVisible({ timeout: 30_000 });
    await expect(la.page.getByRole("heading", { name: /Points leaders/ }).first()).toBeVisible();
    await la.ctx.close();
  });
});
