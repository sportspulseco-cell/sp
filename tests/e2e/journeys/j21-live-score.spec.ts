import { stagingDbUrl } from "./_helpers";
/**
 * J21 · Live score on the captain and player schedules (FR-3.5.2)
 *
 * A published game of Staging Skaters is in play (setup: inserted, then
 * removed). The captain (team-admin-web /schedule) and the player
 * (player-web /schedule) see "Live 0-0". The admin applies 2-1 on the
 * scoresheet (superadmin-web). Without a reload, both schedules show the
 * new score within 25 s (LiveScoreRefresh polls every 10 s while a game
 * is live). Run on staging: local `next start` ignores router.refresh.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Browser } from "@playwright/test";
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
async function open(browser: Browser, app: string, email: string, path: string) {
  const ctx = await browser.newContext(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
  const page = await ctx.newPage();
  await signIn(page, app, email);
  await page.goto(`${app}${path}`);
  return { ctx, page };
}

test.describe("J21 live score", () => {
  test.skip(!IS_STAGING, "J21 mutates data; staging only");
  test.setTimeout(300_000);

  test("J21 journey: score changes reach captain and player without reload", async ({ browser }) => {
    let gameId = "";
    let oppId = "";
    try {
      const [sk] = await stagingSql(`select t.id, t.org_id, t.sport_code from teams t where t.name = 'Staging Skaters' and t.deleted_at is null limit 1`);
      const [lg] = await stagingSql(`select id from leagues where name = 'PPHL Staging League' limit 1`);
      const [opp] = await stagingSql(`insert into teams (org_id, name, sport_code) values ($1, $2, $3) returning id`, [sk.org_id, `${RUN_TAG} Live Opp`, sk.sport_code]);
      oppId = opp.id;
      const [g] = await stagingSql(
        `insert into games (league_id, sport_code, home_team_id, away_team_id, scheduled_start_ts_utc, tz, status, published_at, source, home_score, away_score, period)
         values ($1, $2, $3, $4, now() - interval '20 minutes', 'America/New_York', 'in_play', now(), 'manual', 0, 0, 1) returning id`,
        [lg.id, sk.sport_code, sk.id, oppId]);
      gameId = g.id;

      const cap = await open(browser, E2E_URLS.teamAdmin, SMOKE_USERS.teamAdmin, "/schedule");
      const pl = await open(browser, E2E_URLS.player, SMOKE_USERS.player, "/schedule");
      await expect(cap.page.getByText("Live 0-0").first(), "captain sees the live game").toBeVisible({ timeout: 30_000 });
      await expect(pl.page.getByText("Live 0–0").first(), "player sees the live game").toBeVisible({ timeout: 30_000 });
      await expect(cap.page.getByText(/scores update every 10 s/)).toBeVisible();

      const sa = await open(browser, E2E_URLS.superadmin, SMOKE_USERS.superAdmin, `/games/${gameId}`);
      await sa.page.getByRole("button", { name: /Apply score/i }).click();
      const dlg = sa.page.getByRole("dialog");
      await dlg.getByLabel("Home").fill("2");
      await dlg.getByLabel("Away").fill("1");
      await dlg.locator('button[type="submit"]').click();
      await expect(dlg).toBeHidden({ timeout: 20_000 });
      const [row] = await stagingSql(`select home_score, away_score from games where id = $1`, [gameId]);
      expect(row, "db: score stored").toEqual({ home_score: 2, away_score: 1 });

      // No reload: the pages must pick it up on their own.
      await expect(cap.page.getByText("Live 2-1").first(), "captain schedule updates without reload").toBeVisible({ timeout: 25_000 });
      await expect(pl.page.getByText("Live 2–1").first(), "player schedule updates without reload").toBeVisible({ timeout: 25_000 });
      await Promise.all([cap.ctx.close(), pl.ctx.close(), sa.ctx.close()]);
    } finally {
      if (gameId) await stagingSql(`delete from games where id = $1`, [gameId]).catch(() => {});
      if (oppId) await stagingSql(`delete from teams where id = $1`, [oppId]).catch(() => {});
      await sqlEnd?.();
    }
  });
});
