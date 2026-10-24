import { stagingDbUrl } from "./_helpers";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { E2E_URLS, SMOKE_USERS, signIn, smokePasswordFor } from "../fixtures";
// ./_helpers fails to load (bad playwright.config import path, SETUP-1),
// so this file carries the helpers it needs.
import { BYPASS_STATE_PATH } from "../../../playwright.config";

/**
 * J17 · Role isolation (doc/testing/pphl-journey-matrix.md)
 *
 * Setup (super_admin @ superadmin-web, through the UI):
 *   - org B (tagged) with league / season / division / team
 *   - a sibling league inside the staging org A (same org as the
 *     staging league_admin's league, different league)
 * Then:
 *   - staging org_admin @ org-admin-web: no org-B row in any list, no
 *     org-B id or name in any network payload (API JSON + RSC/HTML),
 *     direct org-B detail URLs are not-found.
 *   - staging league_admin @ staging-league (superadmin-web): same for
 *     org B, plus no sibling-league rows (league scope is narrower than
 *     the org).
 *   - staging org_admin @ superadmin-web (the layout lets org_admin in).
 *   - wrong-role sign-ins not covered by auth/role-gates.spec.ts.
 * STAGING ONLY.
 */

const IS_STAGING = process.env.E2E_TARGET === "staging";
const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;
const tag = RUN_TAG.toLowerCase();
const SA = E2E_URLS.superadmin;
const OA = E2E_URLS.orgAdmin;
const LA = E2E_URLS.league;

const B = {
  org: `Org B ${RUN_TAG}`,
  league: `B League ${RUN_TAG}`,
  season: `B Season ${RUN_TAG}`,
  div: `B Div ${RUN_TAG}`,
  team: `B Team ${RUN_TAG}`
};
const SIB = { league: `A Sibling ${RUN_TAG}`, season: `A Sib Season ${RUN_TAG}`, div: `A Sib Div ${RUN_TAG}` };
const STAGING_ORG = "PPHL Staging";
const STAGING_LEAGUE = "PPHL Staging League";

const ids: Record<string, string> = {};

async function ctx(browser: Browser) {
  return browser.newContext(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
}
let sqlClient: ((q: string, p?: unknown[]) => Promise<any[]>) | null = null;
async function stagingSql(q: string, p: unknown[] = [], attempt = 0): Promise<any[]> {
  if (!IS_STAGING) throw new Error("staging only");
  if (!sqlClient) {
    const { createRequire } = await import("node:module");
    const { resolve } = await import("node:path");
    const env: Record<string, string> = {};
    for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0 && !line.startsWith("#")) env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
    }
    const postgres = createRequire(resolve("packages/db/package.json"))("postgres");
    const sql = postgres(
      stagingDbUrl(env),
      { max: 1, ssl: "require", prepare: false }
    );
    sqlClient = (qq, pp = []) => sql.unsafe(qq, pp as any[]);
  }
  try {
    return await sqlClient(q, p);
  } catch (e) {
    // The staging pooler drops idle connections (ECONNRESET); reconnect once.
    if (attempt < 2 && /ECONNRESET|CONNECTION_|terminated/i.test((e as Error).message)) {
      sqlClient = null;
      return stagingSql(q, p, attempt + 1);
    }
    throw e;
  }
}
const findings: string[] = [];
async function softly(fn: () => void | Promise<void>) {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message.split("\n").slice(0, 6).join(" | ");
    findings.push(msg);
    console.log(`[J17 finding] ${msg}`);
  }
}
function ymd(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
function wizardField(page: Page, label: string) {
  return page
    .locator(`xpath=//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea]`)
    .first();
}
async function wizard(page: Page, orgName: string, w: { league: string; season: string; div: string }) {
  await page.goto(`${SA}/org-setup`);
  await page.getByRole("button", { name: new RegExp(`^PS ${orgName}|${orgName}`) }).first().click();
  await page.getByRole("button", { name: "Next: League" }).click();
  await wizardField(page, "League name").fill(w.league);
  await wizardField(page, "Sport").selectOption({ label: "Ice Hockey" });
  await page.getByRole("button", { name: "Next: Season" }).click();
  await wizardField(page, "Season name").fill(w.season);
  await wizardField(page, "Season start date").fill(ymd(14));
  await wizardField(page, "Season end date").fill(ymd(180));
  await wizardField(page, "Registration opens").fill(ymd(1));
  await wizardField(page, "Registration closes").fill(ymd(10));
  await page.getByRole("button", { name: "Next: Divisions" }).click();
  await wizardField(page, "Division name").fill(w.div);
  await page.getByRole("button", { name: "Publish league" }).click();
  await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 30_000 });
}

/** Record every text payload (API JSON, RSC, HTML) the page receives. */
function capturePayloads(page: Page) {
  const bodies: { url: string; body: string }[] = [];
  page.on("response", async (r) => {
    const type = r.headers()["content-type"] ?? "";
    if (!/json|text\/x-component|text\/html|text\/plain/.test(type)) return;
    try {
      bodies.push({ url: r.url(), body: await r.text() });
    } catch {
      /* redirects / aborted */
    }
  });
  return bodies;
}

function leaksIn(text: string, needles: string[]) {
  return needles.filter((n) => text.includes(n));
}

async function assertListsIsolated(
  page: Page,
  bodies: { url: string; body: string }[],
  app: string,
  who: string,
  paths: string[],
  forbidden: () => string[]
) {
  for (const path of paths) {
    bodies.length = 0;
    const resp = await page.goto(`${app}${path}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const status = resp?.status();
    const text = await page.locator("body").innerText();
    const dom = leaksIn(text, forbidden());
    const net = bodies.flatMap((b) => leaksIn(b.body, forbidden()).map((n) => `${n} in ${b.url.slice(0, 120)}`));
    console.log(`[J17] ${who} ${path} -> ${status} · dom leaks=${dom.length} · payload leaks=${net.length}`);
    await softly(async () => expect(dom, `${who} ${path}: foreign rows rendered`).toEqual([]));
    await softly(async () => expect(net, `${who} ${path}: foreign ids/names in network payload`).toEqual([]));
  }
}

async function assertDetailNotFound(
  page: Page,
  bodies: { url: string; body: string }[],
  who: string,
  url: string,
  forbiddenName: string,
  forbiddenId: string
) {
  bodies.length = 0;
  const resp = await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const text = await page.locator("body").innerText();
  const net = bodies.filter((b) => b.body.includes(forbiddenName)).map((b) => b.url.slice(0, 120));
  console.log(`[J17] ${who} GET ${url.replace(/^https:\/\/[^/]+/, "")} -> ${resp?.status()} · name in DOM=${text.includes(forbiddenName)} · name in payload=${net.length}`);
  await softly(async () => expect(text.includes(forbiddenName), `${who} direct ${url}: foreign record rendered`).toBe(false));
  await softly(async () => expect(net, `${who} direct ${url}: foreign record in payload`).toEqual([]));
  await softly(async () =>
    expect(text, `${who} direct ${url}: should show not-found`).toMatch(/not found|404|could not be found|doesn.t exist/i)
  );
}

test.describe.serial("J17 · role isolation", () => {
  test.skip(!IS_STAGING, "mutating journey — staging only");
  test.setTimeout(240_000);

  test("1. super_admin builds org B (league/season/division/team) and a sibling league in org A", async ({ browser }) => {
    const context = await ctx(browser);
    const page = await context.newPage();
    try {
      await signIn(page, SA, SMOKE_USERS.superAdmin);
      // Org B
      await page.goto(`${SA}/organizations`);
      await page.getByRole("button", { name: "New organization" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#displayName").fill(B.org);
      await dialog.locator("#legalName").fill(`${B.org} Inc.`);
      await dialog.locator("#slug").fill(`org-b-${tag}`);
      await dialog.getByRole("button", { name: "Create organization" }).click();
      // Create continues into "Choose the org admin" (24 Oct); J17 grants roles itself.
      await expect(page.getByRole("heading", { name: "Choose the org admin" })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Close dialog" }).click();
      await expect(page.getByRole("link", { name: B.org })).toBeVisible({ timeout: 15_000 });
      await wizard(page, B.org, B);
      ids.bLeague = page.url().split("/leagues/")[1]!.split(/[?#]/)[0]!;
      // Team in org B (Home rink filled: blank rink 500s, see SETUP-6)
      await page.goto(`${SA}/teams/new`);
      await page.getByRole("combobox", { name: "Organisation *" }).selectOption({ label: B.org });
      await page.getByRole("textbox", { name: "Team name *" }).fill(B.team);
      await page.getByRole("textbox", { name: "Home rink" }).fill(`B Rink ${RUN_TAG}`);
      await page.getByRole("combobox", { name: "Sport *" }).selectOption({ label: "Ice Hockey" });
      await page.getByRole("button", { name: "Create team" }).click();
      await page.waitForURL(/\/teams\/[0-9a-f-]{36}/, { timeout: 30_000 });
      // Sibling league inside the staging org A
      await wizard(page, STAGING_ORG, SIB);
      ids.sibLeague = page.url().split("/leagues/")[1]!.split(/[?#]/)[0]!;
    } finally {
      await context.close();
    }
    const [o] = await stagingSql("select id from orgs where slug=$1", [`org-b-${tag}`]);
    ids.bOrg = o.id;
    const [s] = await stagingSql("select id from seasons where league_id=$1", [ids.bLeague]);
    ids.bSeason = s.id;
    const [d] = await stagingSql("select id from divisions where season_id=$1", [ids.bSeason]);
    ids.bDiv = d.id;
    const [t] = await stagingSql("select id from teams where org_id=$1", [ids.bOrg]);
    ids.bTeam = t.id;
    const [ss] = await stagingSql("select id from seasons where league_id=$1", [ids.sibLeague]);
    ids.sibSeason = ss.id;
    const [sd] = await stagingSql("select id from divisions where season_id=$1", [ids.sibSeason]);
    ids.sibDiv = sd.id;
    console.log(`[J17] ids=${JSON.stringify(ids)}`);
  });

  const orgB = () => [B.org, B.league, B.season, B.div, B.team, ids.bOrg!, ids.bLeague!, ids.bSeason!, ids.bDiv!, ids.bTeam!];
  const sib = () => [SIB.league, SIB.season, SIB.div, ids.sibLeague!, ids.sibSeason!, ids.sibDiv!];

  test("2. org_admin (org A) on org-admin-web: lists, payloads, direct URLs", async ({ browser }) => {
    const context = await ctx(browser);
    const page = await context.newPage();
    const bodies = capturePayloads(page);
    try {
      await signIn(page, OA, SMOKE_USERS.orgAdmin);
      // Positive control: the sibling league lives in org A and SHOULD show.
      await page.goto(`${OA}/leagues`);
      await expect(page.getByText(SIB.league).first(), "positive control: org A's own new league is listed").toBeVisible();
      await assertListsIsolated(page, bodies, OA, "org_admin@OA",
        ["/", "/leagues", "/seasons", "/divisions", "/teams", "/registrations", "/finance", "/audit", "/venues", "/forms", "/scheduling"],
        orgB);
      await assertDetailNotFound(page, bodies, "org_admin@OA", `${OA}/leagues/${ids.bLeague}`, B.league, ids.bLeague!);
      await assertDetailNotFound(page, bodies, "org_admin@OA", `${OA}/seasons/${ids.bSeason}`, B.season, ids.bSeason!);
      await assertDetailNotFound(page, bodies, "org_admin@OA", `${OA}/divisions/${ids.bDiv}`, B.div, ids.bDiv!);
      await assertDetailNotFound(page, bodies, "org_admin@OA", `${OA}/teams/${ids.bTeam}`, B.team, ids.bTeam!);
    } finally {
      await context.close();
    }
  });

  test("3. league_admin (staging league) on staging-league: no org B, no sibling league", async ({ browser }) => {
    const context = await ctx(browser);
    const page = await context.newPage();
    const bodies = capturePayloads(page);
    try {
      await signIn(page, LA, SMOKE_USERS.leagueAdmin);
      await page.goto(`${LA}/leagues`);
      await expect(page.getByText(STAGING_LEAGUE).first(), "positive control: own league listed").toBeVisible();
      await assertListsIsolated(page, bodies, LA, "league_admin@LA",
        ["/dashboard", "/organizations", "/leagues", "/seasons", "/divisions", "/teams", "/registrations", "/finance", "/audit", "/users", "/venues"],
        () => [...orgB(), ...sib()]);
      await assertDetailNotFound(page, bodies, "league_admin@LA", `${LA}/leagues/${ids.bLeague}`, B.league, ids.bLeague!);
      await assertDetailNotFound(page, bodies, "league_admin@LA", `${LA}/organizations/${ids.bOrg}`, B.org, ids.bOrg!);
      await assertDetailNotFound(page, bodies, "league_admin@LA", `${LA}/teams/${ids.bTeam}`, B.team, ids.bTeam!);
      await assertDetailNotFound(page, bodies, "league_admin@LA", `${LA}/leagues/${ids.sibLeague}`, SIB.league, ids.sibLeague!);
      await assertDetailNotFound(page, bodies, "league_admin@LA", `${LA}/seasons/${ids.sibSeason}`, SIB.season, ids.sibSeason!);
    } finally {
      await context.close();
    }
  });

  test("4. org_admin signed in on superadmin-web sees only org A", async ({ browser }) => {
    const context = await ctx(browser);
    const page = await context.newPage();
    const bodies = capturePayloads(page);
    try {
      await signIn(page, SA, SMOKE_USERS.orgAdmin);
      const landed = new URL(page.url());
      console.log(`[J17] org_admin on superadmin-web landed on ${landed.pathname}${landed.search}`);
      if (landed.pathname.startsWith("/sign-in")) return; // blocked = isolated
      await assertListsIsolated(page, bodies, SA, "org_admin@SA",
        ["/dashboard", "/organizations", "/leagues", "/seasons", "/divisions", "/teams", "/users", "/audit", "/finance"],
        orgB);
      await assertDetailNotFound(page, bodies, "org_admin@SA", `${SA}/organizations/${ids.bOrg}`, B.org, ids.bOrg!);
    } finally {
      await context.close();
    }
  });

  // Pairs NOT already covered by tests/e2e/auth/role-gates.spec.ts
  // (that file covers player→org-admin, org-admin→team-admin, league-admin→player).
  const WRONG: Array<{ who: keyof typeof SMOKE_USERS; app: string; appName: string; guarded: string }> = [
    { who: "teamAdmin", app: SA, appName: "superadmin-web", guarded: "/organizations" },
    { who: "player", app: SA, appName: "superadmin-web", guarded: "/users" },
    { who: "teamAdmin", app: OA, appName: "org-admin-web", guarded: "/leagues" },
    { who: "leagueAdmin", app: OA, appName: "org-admin-web", guarded: "/leagues" },
    // staging-player also holds captain/team (dual-role fixture), so it is
    // NOT a wrong-role user for team-admin-web. Use the captain-only user
    // on player-web instead.
    { who: "teamAdmin", app: E2E_URLS.player, appName: "player-web", guarded: "/payments" }
  ];
  for (const w of WRONG) {
    test(`5. wrong role: ${w.who} cannot use ${w.appName}`, async ({ browser }) => {
      const context = await ctx(browser);
      const page = await context.newPage();
      try {
        await page.goto(`${w.app}/sign-in`);
        await page.locator("input[type='email']").fill(SMOKE_USERS[w.who]);
        await page.locator("input[type='password']").fill(smokePasswordFor(SMOKE_USERS[w.who]));
        await page.locator("button[type='submit']").click();
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const after = new URL(page.url());
        const msg = (await page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " / ");
        console.log(`[J17] ${w.who} sign-in on ${w.appName} -> ${after.pathname}${after.search} · "${msg}"`);
        await page.goto(`${w.app}${w.guarded}`);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        const u = new URL(page.url());
        console.log(`[J17] ${w.who} direct ${w.guarded} on ${w.appName} -> ${u.pathname}${u.search}`);
        await softly(async () =>
          expect(u.pathname.startsWith("/sign-in") || u.pathname.startsWith("/onboarding"), `${w.who} reached ${w.appName}${w.guarded}`).toBe(true)
        );
        if (after.pathname.startsWith("/sign-in")) {
          await softly(async () => expect(msg, `${w.who} on ${w.appName}: wrong-role message is readable`).toMatch(/role|access|permission|not allowed/i));
        }
      } finally {
        await context.close();
      }
    });
  }

  test("6. no bug findings were recorded along the journey", async () => {
    expect(findings, findings.join("\n")).toEqual([]);
  });
});
