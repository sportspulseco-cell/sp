// Destination check for the full-season run, in a real browser signed in
// as each role on its own staging app. Reads the accounts the run made from
// test-results-season/latest.json (or the run file given as argv[2]).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { env, OUT, ROOT, SUPABASE_IP } from "./lib.mjs";

const { chromium } = createRequire(path.join(ROOT, "package.json"))("@playwright/test");
const runFile = process.argv[2] ?? path.join(OUT, "latest.json");
const { ids } = JSON.parse(readFileSync(runFile, "utf8"));
const PW = `Play!${ids.tag}x9`;
const SHOTS = path.join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });
const URLS = { player: "https://staging-player.sportspulse.us", team: "https://staging-team.sportspulse.us", org: "https://staging-org.sportspulse.us" };
const results = [];
const check = (what, ok, detail = "") => { results.push({ what, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${what}${detail ? `  -- ${String(detail).slice(0, 200)}` : ""}`); };

const b = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
async function as(app, email, password) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(90000);
  // Staging apps sit behind Vercel protection: set the bypass cookie first.
  const secret = env[`STAGING_VERCEL_BYPASS_${app.toUpperCase()}`];
  const url = new URL("/sign-in", URLS[app]);
  if (secret) { url.searchParams.set("x-vercel-protection-bypass", secret); url.searchParams.set("x-vercel-set-bypass-cookie", "true"); }
  await p.goto(url.toString());
  await p.locator("input[type='email']").fill(email);
  await p.locator("input[type='password']").fill(password);
  await p.locator("button[type='submit']").click();
  await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 90000 });
  return { ctx, p };
}
async function look(p, route, shot) {
  await p.goto(`${p.url().split("/").slice(0, 3).join("/")}${route}`);
  await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await p.screenshot({ path: path.join(SHOTS, `${shot}.png`), fullPage: true }).catch(() => {});
  return (await p.locator("main").first().innerText().catch(() => p.locator("body").innerText())).replace(/\s+/g, " ");
}
try {
  // Player: the first rostered Team Alpha player, on their own app.
  const pl = (ids.players["Team Alpha"] ?? []).find((x) => x.rostered);
  check("the run rostered a Team Alpha player", !!pl);
  if (pl) {
    const { ctx, p } = await as("player", pl.email, PW);
    const team = await look(p, "/team", "player-team");
    check(`player-web /team: ${pl.name} sees Team Alpha with themself on it`, team.includes("Team Alpha") && team.includes(pl.name), team.slice(0, 160));
    const sch = await look(p, "/schedule", "player-schedule");
    check("player-web /schedule: Team Alpha's games against its division", ["Bravo", "Charlie", "Delta"].some((w) => sch.includes(`Team ${w}`)), sch.slice(0, 200));
    const st = await look(p, "/stats", "player-stats");
    check("player-web /stats: the page shows Team Alpha's season", st.includes("Team Alpha"), st.slice(0, 200));
    await ctx.close();
  }
  // Captain: Capt Alpha, on the team app.
  const cap = ids.captains["Team Alpha"];
  check("the run made a Team Alpha captain", !!cap);
  if (cap) {
    const { ctx, p } = await as("team", cap.email, PW);
    const ro = await look(p, "/roster", "captain-roster");
    const names = (ids.players["Team Alpha"] ?? []).filter((x) => x.rostered).map((x) => x.name);
    const seen = names.filter((n) => ro.includes(n));
    check(`team-admin /roster: Capt Alpha sees all ${names.length} registered players`, seen.length === names.length && names.length > 0, `seen ${seen.length}/${names.length}`);
    check("team-admin /roster: the captain is listed on the roster", /Capt Alpha/.test(ro), ro.slice(0, 200));
    const sch = await look(p, "/schedule", "captain-schedule");
    check("team-admin /schedule: the published games show", ["Bravo", "Charlie", "Delta"].some((w) => sch.includes(`Team ${w}`)), sch.slice(0, 200));
    await ctx.close();
  }
  // Org admin: the season and its divisions.
  {
    const { ctx, p } = await as("org", env.STAGING_ORG_EMAIL, env.STAGING_ORG_PASSWORD);
    const se = await look(p, `/seasons/${ids.seasonId}`, "org-season");
    check("org-admin season page shows Season 2026 and its divisions", se.includes("Season 2026") && se.includes("Div A") && se.includes("Div C"), se.slice(0, 200));
    await ctx.close();
  }
} catch (e) {
  check("browser walk finished", false, String(e).slice(0, 300));
} finally {
  await b.close();
  writeFileSync(runFile.replace(/\.json$/, "-browser.json"), JSON.stringify(results, null, 2));
  const pass = results.filter((r) => r.ok).length;
  console.log(`${pass}/${results.length} browser checks passed`);
  process.exitCode = pass === results.length ? 0 : 1;
}
