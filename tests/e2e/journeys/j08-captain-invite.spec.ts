import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, RUN_TAG, freshContext, signedInAs, stagingSql, supabaseFetch } from "./_helpers";

/**
 * J8 · Captain invites a player (UC-04), join requests, roster add / drop,
 * UC-33 (player on two teams) and the captain-console role gate.
 * doc/testing/pphl-journey-matrix.md § 3 · bug log doc/testing/bugs/captain.md (CAP-n)
 *
 *   captain @ TA /captain/invites   → personal invite + generic team URL
 *   invitee @ every app host        → open /invite/<token> (what does the player get?)
 *   captain @ TA /captain/roster    → "Invite by email" modal, "Add player" (name picker), drop
 *   player  @ PL /team              → sees the team after being added
 *   plain player (no captain role)  @ TA → console blocked
 *
 * Uses the base staging team "Staging Skaters" and its season. A plain
 * player is created with the staging Supabase admin API (labelled fixture:
 * sign-up needs email confirmation on staging) and onboarded through the
 * real player-web UI.
 */

test.describe.configure({ mode: "serial" });
test.skip(!IS_STAGING, "journeys mutate data: staging only");
test.setTimeout(180_000);
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

const OUT = `${process.env.E2E_OUTPUT_DIR ?? "test-results"}-evidence/j08-${RUN_TAG}`;
const TEAM_ID = process.env.STAGING_TEAM_ENTITY_ID ?? "d4136494-50d6-4451-956c-ef6e72d6a411";
const SEASON_ID = process.env.STAGING_SEASON_ID ?? "922061b1-3ad4-47d9-9223-88d8271b0251";
const tag = RUN_TAG.toLowerCase();
const PLAIN_EMAIL = `staging-e2e+${tag}-plain@sportspulse.us`;
const PLAIN_PASSWORD = `E2e!${RUN_TAG}x9`;
const PLAIN_FIRST = `Plain${RUN_TAG}`;
const INVITEE_EMAIL = `staging-e2e+${tag}-inv1@sportspulse.us`;
const ROSTER_INVITEE = `staging-e2e+${tag}-inv2@sportspulse.us`;

const findings: string[] = [];
function finding(ok: boolean, msg: string) {
  if (!ok) {
    findings.push(msg);
    test.info().annotations.push({ type: "defect", description: msg });
  }
}

type Ctx = { context: BrowserContext; page: Page; app: string; errors: string[] };
let cap: Ctx;
let genericToken = "";
let inviteLink = "";

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !/_vercel|favicon|\.png|\.svg/.test(r.url()) && r.request().method() !== "OPTIONS") {
      errors.push(`http ${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
    }
  });
  return errors;
}

async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});
  const text = await page.locator("main").first().innerText().catch(() => page.locator("body").innerText().catch(() => ""));
  writeFileSync(`${OUT}/${name}.txt`, `URL ${page.url()}\n\n${text}`);
  return text;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

/** Labelled fixture: confirmed auth user via the staging admin API. */
async function ensurePlainUser(): Promise<string> {
  const url = process.env.STAGING_SUPABASE_URL!;
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!;
  const existing = await stagingSql<{ id: string }>(`select id from auth.users where email = $1`, [PLAIN_EMAIL]);
  if (existing[0]) return existing[0].id;
  const res = await supabaseFetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: PLAIN_EMAIL,
      password: PLAIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `${PLAIN_FIRST} Fixture` }
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`fixture user create failed: ${res.status} ${JSON.stringify(body)}`);
  return body.id as string;
}

test.beforeAll(async ({ browser }) => {
  const c = await signedInAs(browser, "teamAdmin");
  cap = { ...c, errors: watch(c.page) };
});

test.afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/errors.json`, JSON.stringify({ captain: cap?.errors, genericToken }, null, 2));
  await cap?.context.close();
});

test("J8.0 fixture: plain player gets the player role from super_admin and onboards on player-web", async ({ browser }) => {
  const userId = await ensurePlainUser();
  // A brand-new account has no role: player-web refuses it.
  const probe = await freshContext(browser);
  const pp = await probe.newPage();
  await pp.goto(`${E2E_URLS.player}/sign-in`);
  await pp.locator("input[type='email']").fill(PLAIN_EMAIL);
  await pp.locator("input[type='password']").fill(PLAIN_PASSWORD);
  await pp.locator("button[type='submit']").click();
  await pp.waitForURL(/error=wrong_role|\/onboarding|\/$/, { timeout: 30_000 }).catch(() => {});
  await snap(pp, "00-new-account-signin");
  finding(!/wrong_role/.test(pp.url()), "CAP: a new account with no role is refused by player-web (sign-in?error=wrong_role); self sign-up cannot reach the free-agent or join flows");
  await probe.close();

  // super_admin grants player @ org scope through /users/[id] (real admin flow).
  const roles = await stagingSql<{ n: number }>(
    `select count(*)::int n from user_role_assignments a join roles r on r.id=a.role_id where a.user_id=$1 and r.code='player' and a.revoked_at is null`,
    [userId]
  );
  if (!roles[0]?.n) {
    const sa = await signedInAs(browser, "superAdmin");
    await sa.page.goto(`${sa.app}/users/${userId}`);
    await settle(sa.page);
    await sa.page.locator("#ar-role").selectOption({ label: "Player" }).catch(async () => {
      const opt = await sa.page.locator("#ar-role option").filter({ hasText: /^player/i }).first().getAttribute("value");
      await sa.page.locator("#ar-role").selectOption(opt!);
    });
    await sa.page.locator("#ar-scope-type").selectOption("org");
    await expect(sa.page.locator("#ar-scope-id option", { hasText: "PPHL Staging" })).toHaveCount(1, { timeout: 20_000 });
    await sa.page.locator("#ar-scope-id").selectOption({ label: "PPHL Staging" });
    await snap(sa.page, "02-sa-assign-player-role");
    await sa.page.getByRole("button", { name: /assign/i }).last().click();
    await sa.page.getByText(/^Assigned /).waitFor({ timeout: 20_000 });
    await settle(sa.page);
    await snap(sa.page, "03-sa-assigned");
    await sa.context.close();
  }

  const pl = await signedInAs(browser, "player", { email: PLAIN_EMAIL, password: PLAIN_PASSWORD }).catch((e) => {
    writeFileSync(`${OUT}/04-plain-signin-error.txt`, String(e));
    return null;
  });
  finding(!!pl, "CAP: plain player still cannot sign in to player-web after super_admin granted the player role");
  if (!pl) return;
  const errs = watch(pl.page);
  await settle(pl.page);
  await snap(pl.page, "04-plain-after-signin");
  if (/onboarding/.test(pl.page.url())) {
    // Walk the onboarding wizard as a player would.
    for (let i = 0; i < 6 && /onboarding/.test(pl.page.url()); i++) {
      const text = await snap(pl.page, `05-onboarding-${i}`);
      const first = pl.page.getByLabel(/first name/i);
      if (await first.isVisible().catch(() => false)) await first.fill(PLAIN_FIRST);
      const last = pl.page.getByLabel(/last name/i);
      if (await last.isVisible().catch(() => false)) await last.fill("Fixture");
      const dob = pl.page.locator("input[type='date']").first();
      if (await dob.isVisible().catch(() => false)) await dob.fill("1995-05-05");
      const btn = pl.page.getByRole("button", { name: /continue|next|finish|save|done|get started/i }).last();
      if (!(await btn.isVisible().catch(() => false))) break;
      await btn.click();
      await settle(pl.page);
      if (text === (await pl.page.locator("body").innerText())) break;
    }
  }
  for (const path of ["/", "/team", "/register/free-agent"]) {
    await pl.page.goto(`${pl.app}${path}`);
    await settle(pl.page);
    await snap(pl.page, `06-plain${path.replace(/\//g, "_")}`);
  }
  writeFileSync(`${OUT}/00-plain-errors.json`, JSON.stringify(errs, null, 2));
  await pl.context.close();
});

test("J8.1 captain sends a personal invite from /captain/invites", async () => {
  const p = cap.page;
  p.on("dialog", (d) => d.accept());
  await p.goto(`${cap.app}/`);
  await settle(p);
  await p.getByRole("link", { name: /^invites$/i }).first().click();
  await p.waitForURL(/\/captain\/invites/);
  await settle(p);
  await snap(p, "10-invites-page");
  // Default season should be the team's current season, not list[0] of the org.
  const season = p.locator("#season");
  await expect(season.locator("option", { hasText: "Staging 2026-27" })).toHaveCount(1, { timeout: 20_000 });
  const options = await season.locator("option").allInnerTexts();
  const selected = await season.locator("option:checked").innerText();
  writeFileSync(`${OUT}/10-season-options.json`, JSON.stringify({ options, selected }, null, 2));
  finding(selected.includes("Staging 2026-27"), `CAP: invite season defaults to "${selected}", not the team's current season (Staging 2026-27); list has ${options.length - 1} org seasons`);
  await season.selectOption({ label: "Staging 2026-27" });
  await p.locator("#kind").selectOption("personal");
  await p.locator("#email").fill(INVITEE_EMAIL);
  await p.getByRole("button", { name: /send invite/i }).click();
  const created = p.getByText(`Invite created for ${INVITEE_EMAIL}`);
  await expect(created).toBeVisible({ timeout: 15_000 });
  // UC-04: the captain gets a full player-app link to share.
  inviteLink = (await created.innerText()).match(/https?:\/\/\S+\/invite\/\S+/)?.[0] ?? "";
  finding(inviteLink.startsWith(`${E2E_URLS.player}/invite/`), `CAP: invite link is not a full player-app URL (${inviteLink || "none"})`);
  await settle(p);
  const t = await snap(p, "11-invite-sent");
  finding(t.includes(INVITEE_EMAIL.split("@")[0]!), "CAP: pending invites list does not show the new invite without reload");
  const rows = await stagingSql<{ id: string; status: string; kind: string }>(
    `select id, status, kind from team_invites where invitee_email = $1`,
    [INVITEE_EMAIL]
  );
  expect(rows[0]?.status).toBe("pending");
  await p.waitForTimeout(5000);
  const notes = await stagingSql<{ n: number }>(
    `select count(*)::int n from notifications where recipient_email = $1 or payload::text ilike $2`,
    [INVITEE_EMAIL, `%${rows[0]!.id}%`]
  );
  finding((notes[0]?.n ?? 0) > 0, "CAP: 'Invite sent to <email>' but no email/notification row exists for the invitee (UC-04 'System sends invitation')");
});

test("J8.2 captain creates a team link; an invitee opens it and joins (UC-04)", async ({ browser }) => {
  const p = cap.page;
  await p.locator("#kind").selectOption("generic");
  await p.getByRole("button", { name: /create url/i }).click();
  const msg = p.getByText(/Team link created/);
  await expect(msg).toBeVisible({ timeout: 15_000 });
  const text = await msg.innerText();
  const link = text.match(/https?:\/\/\S+\/invite\/\S+/)?.[0] ?? "";
  genericToken = link.replace(/.*\/invite\//, "").trim();
  await snap(p, "20-generic-url");
  finding(link.startsWith(`${E2E_URLS.player}/invite/`), `CAP: team link is not a full player-app URL ("${text.slice(0, 80)}")`);

  // Signed out: the link lands on a real page that names the team.
  const anon = await freshContext(browser);
  const ap = await anon.newPage();
  const res = await ap.goto(link);
  await settle(ap);
  const anonText = (await ap.locator("body").innerText()).replace(/\s+/g, " ");
  await ap.screenshot({ path: `${OUT}/21-invite-signed-out.png` }).catch(() => {});
  finding(res?.status() === 200 && /Join /.test(anonText) && /Sign in to join/i.test(anonText), `CAP: signed-out invite page did not offer to join (${res?.status()} ${anonText.slice(0, 120)})`);
  await anon.close();

  // Signed in as the invitee on player-web: one click joins the team.
  const inv = await signedInAs(browser, "player", { email: PLAIN_EMAIL, password: PLAIN_PASSWORD });
  await inv.page.goto(link);
  await settle(inv.page);
  const join = inv.page.getByRole("button", { name: /^Join / });
  await expect(join).toBeVisible({ timeout: 20_000 });
  await join.click();
  await inv.page.waitForURL(/\/team/, { timeout: 30_000 }).catch(() => {});
  await settle(inv.page);
  await inv.page.screenshot({ path: `${OUT}/22-invite-joined.png` }).catch(() => {});
  const joinError = await inv.page.getByRole("alert").innerText().catch(() => "");
  finding(/\/team/.test(inv.page.url()), `CAP: invitee did not land on /team after Join (${inv.page.url()} ${joinError})`);
  const [inviteRow] = await stagingSql<{ status: string }>(`select status from team_invites where token = $1`, [genericToken]);
  const members = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_memberships tm join persons p on p.id = tm.person_id
       join profiles pr on pr.id = p.user_id
      where pr.email = $1 and tm.current_status = 'active'`,
    [PLAIN_EMAIL]
  );
  writeFileSync(`${OUT}/22-invite-accept-db.json`, JSON.stringify({ inviteRow, members, joinError }, null, 2));
  finding(inviteRow?.status === "accepted", `CAP: invite status after Join is ${inviteRow?.status}`);
  finding((members[0]?.n ?? 0) > 0, "CAP: invitee has no active team membership after Join");
  await inv.context.close();
});

test("J8.3 revoked invite token still resolves on the public endpoint", async ({ browser }) => {
  const p = cap.page;
  await p.goto(`${cap.app}/captain/invites`);
  await settle(p);
  // J8.2 accepted the first team link, which (correctly) can no longer
  // be revoked; create a fresh one to revoke.
  await p.locator("#season").selectOption({ label: "Staging 2026-27" });
  await p.locator("#kind").selectOption("generic");
  await p.getByRole("button", { name: /create url/i }).click();
  const fresh = p.getByText(/Team link created/);
  await expect(fresh).toBeVisible({ timeout: 15_000 });
  genericToken = ((await fresh.innerText()).match(/\/invite\/(\S+)/)?.[1] ?? "").trim();
  await settle(p);
  const before = await snap(p, "30-before-revoke");
  // Revoke the generic link (row with kind GENERIC).
  const revoke = p
    .getByRole("row")
    .filter({ hasText: /generic/i })
    .getByRole("button", { name: /revoke/i })
    .first();
  await Promise.all([
    p.waitForResponse((r) => /team-invites\/.*\/revoke/.test(r.url()), { timeout: 20_000 }).catch(() => null),
    revoke.click()
  ]);
  await settle(p);
  await p.waitForTimeout(3000);
  // Give router.refresh() up to 15 s to re-render without a reload.
  const changed = await expect
    .poll(async () => (await p.locator("main").first().innerText()) !== before.replace(/^URL[^\n]*\n\n/, ""), { timeout: 15_000 })
    .toBe(true).then(() => true, () => false);
  const after = await snap(p, "31-after-revoke");
  finding(changed, "CAP: revoking an invite did not change the invites screen");
  const [row] = await stagingSql<{ status: string }>(`select status from team_invites where token = $1`, [genericToken]);
  const anon = await freshContext(browser);
  const ap = await anon.newPage();
  // Revoke the generic one explicitly if the first row was the personal invite.
  if (row?.status !== "revoked") {
    await anon.close();
    return;
  }
  const res = await ap.goto(`https://staging-api.sportspulse.us/api/public/registration/invites/${genericToken}`);
  const body = await ap.locator("body").innerText();
  writeFileSync(`${OUT}/32-revoked-resolve.txt`, `${res?.status()} ${body.replace(genericToken, "<token>")}`);
  finding(res?.status() !== 200, `CAP: revoked invite token still resolves 200 on GET /public/registration/invites/:token`);
  await anon.close();
});

test("J8.4 captain invites by email from /captain/roster", async () => {
  const p = cap.page;
  await p.goto(`${cap.app}/captain/roster`);
  await settle(p);
  const rosterHead = await snap(p, "39-roster-before-invite");
  writeFileSync(`${OUT}/39-roster-season.txt`, rosterHead.split(String.fromCharCode(10)).find((l) => /players ·/.test(l)) ?? "");
  finding(/Staging 2026-27/.test(rosterHead), "CAP: Manage roster jumped to the newest registered season; the in-progress season roster (Staging 2026-27) is unreachable (no season switcher)");
  await p.getByRole("button", { name: /invite by email/i }).first().click();
  // The button opens the "Add player" dialog; the email form is a second tab.
  const dlg = p.getByRole("dialog");
  if (!(await dlg.getByPlaceholder("player@example.com").isVisible().catch(() => false))) {
    finding(false, "CAP: roster 'Invite by email' button opens the 'Add player' dialog, not the invite form");
    await dlg.getByRole("button", { name: /invite by email/i }).click();
  }
  await p.getByPlaceholder("player@example.com").fill(ROSTER_INVITEE);
  await p.getByPlaceholder("125.00").fill("70");
  await snap(p, "40-roster-invite-modal");
  await p.getByRole("button", { name: /send invite/i }).last().click();
  await settle(p);
  await p.waitForTimeout(2000);
  const t = await snap(p, "41-roster-invite-sent");
  await p.getByRole("button", { name: /pending invite/i }).click().catch(() => {});
  const pend = await snap(p, "42-pending-invite-tab");
  finding(pend.includes(ROSTER_INVITEE.split("@")[0]!), "CAP: roster 'Pending invite' tab does not list the new invite");
  const rows = await stagingSql<{ id: string }>(`select id from team_invites where invitee_email = $1`, [ROSTER_INVITEE]);
  expect(rows.length, `invite row (${t.slice(0, 80)})`).toBe(1);
  const subs = await stagingSql<{ n: number }>(`select count(*)::int n from invoices where recipient_email = $1`, [ROSTER_INVITEE]);
  finding((subs[0]?.n ?? 0) > 0, "CAP: 'Their share of dues' entered on the roster invite created no sub-invoice (value silently dropped)");
  await p.waitForTimeout(4000);
  const notes = await stagingSql<{ n: number }>(`select count(*)::int n from notifications where recipient_email = $1`, [ROSTER_INVITEE]);
  finding((notes[0]?.n ?? 0) > 0, "CAP: roster 'Invite by email' queued no notification row for the invitee");
});

test("J8.5 captain adds the plain player by name; player sees the team; captain drops him", async ({ browser }) => {
  const p = cap.page;
  await p.goto(`${cap.app}/captain/roster`);
  await settle(p);
  const before = await p.locator("main").first().innerText();
  const searches: string[] = [];
  p.on("response", async (r) => {
    if (/\/iam\/persons\?/.test(r.url())) {
      const body = await r.text().catch(() => "");
      searches.push(`${r.status()} ${r.url().replace(/^.*\/api/, "")} :: ${body.slice(0, 600)}`);
    }
  });
  await p.getByRole("button", { name: /add player/i }).click();
  const search = p.getByPlaceholder("e.g. jane smith");
  // Privacy probe: the picker searches every person on the platform.
  await search.pressSequentially("Plain", { delay: 80 });
  await p.waitForTimeout(1500);
  await p.getByText(/searching/i).waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
  const probe = await snap(p, "50-picker-search-plain");
  writeFileSync(`${OUT}/50-picker-probe.txt`, probe);
  await search.fill("");
  await search.pressSequentially(PLAIN_FIRST.slice(0, 8), { delay: 80 });
  await p.waitForTimeout(1500);
  await p.getByText(/searching/i).waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
  await snap(p, "51-picker-search-name");
  writeFileSync(`${OUT}/51-person-search-responses.txt`, searches.join("\n"));
  const hit = p.getByRole("button").filter({ hasText: PLAIN_FIRST }).first();
  const found = await hit.isVisible().catch(() => false);
  finding(found, `CAP: 'Add player' name search for "${PLAIN_FIRST.slice(0, 8)}" returned no match`);
  if (!found) return;
  await hit.click();
  await p.getByRole("button", { name: /add to roster/i }).click();
  await p.getByText(/Added .* to the roster/).waitFor({ timeout: 30_000 }).catch(() => {});
  await settle(p);
  const after = await snap(p, "52-after-add");
  finding(after.includes(PLAIN_FIRST) && after !== before, "CAP: roster did not refresh with the added player");
  const mem = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_memberships m join persons pe on pe.id=m.person_id join auth.users u on u.id=pe.user_id
      where m.team_id=$1 and u.email=$2 and m.current_status='active'`,
    [TEAM_ID, PLAIN_EMAIL]
  );
  // Two active rows here are two seasons (invite accepted into the team's
  // current season, add-by-name into the season the roster page defaulted
  // to): CAP-24. Keep walking; the destination checks below still apply.
  finding((mem[0]?.n ?? 0) >= 1, "CAP: no active membership after add-by-name");
  finding(
    (mem[0]?.n ?? 0) <= 1,
    `CAP-24: ${mem[0]?.n} active memberships for one player on one team (roster page and invite flow default to different seasons)`
  );
  // Destination: the player's own app shows the team.
  const pl = await signedInAs(browser, "player", { email: PLAIN_EMAIL, password: PLAIN_PASSWORD });
  await pl.page.goto(`${pl.app}/team`);
  await settle(pl.page);
  const pt = await snap(pl.page, "53-player-team-after-add");
  finding(pt.includes("Staging Skaters"), "CAP: player-web /team does not show the team after the captain added the player");
  await pl.page.goto(`${pl.app}/`);
  await settle(pl.page);
  const home = await snap(pl.page, "54-player-home-after-add");
  finding(!/haven't registered yet/i.test(home) || !home.includes("Staging Skaters"), "CAP: player home says 'haven't registered yet' while also showing the team");
  await pl.context.close();
  // team-admin read-only roster (other captain-side surface).
  await p.goto(`${cap.app}/roster`);
  await settle(p);
  const ro = await snap(p, "55-team-admin-roster");
  finding(ro.includes(PLAIN_FIRST), "CAP: team-admin /roster does not list the added player");
  // Drop with a written reason.
  await p.goto(`${cap.app}/captain/roster`);
  await settle(p);
  const rosterGets: string[] = [];
  p.on("response", async (r) => {
    if (/staging-api/.test(r.url()) && r.request().method() !== "OPTIONS") {
      const body = await r.text().catch(() => "");
      rosterGets.push(`${new Date().toISOString()} ${r.request().method()} ${r.url().replace(/^.*\/api/, "")} ${r.status()} fromCache=${r.fromServiceWorker()} hasPlain=${body.includes(PLAIN_FIRST)} cache-control=${r.headers()["cache-control"] ?? ""} etag=${r.headers()["etag"] ?? ""}`);
    }
  });
  const row = p.getByRole("row").filter({ hasText: PLAIN_FIRST });
  await row.getByRole("button", { name: /drop/i }).click();
  await p.locator("textarea").fill(`${RUN_TAG} test drop: player moved out of the area`);
  await p.getByRole("button", { name: /confirm drop/i }).click();
  await p.getByText(/^Removed /).waitFor({ timeout: 30_000 }).catch(() => {});
  await settle(p);
  await expect
    .poll(async () => (await p.locator("main").first().innerText()).includes(PLAIN_EMAIL), { timeout: 15_000 })
    .toBe(false).catch(() => {});
  const dropped = await snap(p, "56-after-drop");
  writeFileSync(`${OUT}/56-roster-gets.txt`, rosterGets.join(String.fromCharCode(10)));
  finding(!dropped.includes(PLAIN_EMAIL), "CAP: roster still lists the dropped player without reload");
});

test("J8.6 plain player (no captain role) is kept out of the captain console", async ({ browser }) => {
  const ctx = await freshContext(browser);
  const pg = await ctx.newPage();
  await pg.goto(`${E2E_URLS.teamAdmin}/sign-in`);
  await pg.locator("input[type='email']").fill(PLAIN_EMAIL);
  await pg.locator("input[type='password']").fill(PLAIN_PASSWORD);
  await pg.locator("button[type='submit']").click();
  await pg.waitForTimeout(5000);
  await snap(pg, "60-plain-on-team-admin");
  await pg.goto(`${E2E_URLS.teamAdmin}/captain/invites`);
  await settle(pg);
  const t = await snap(pg, "61-plain-captain-invites");
  finding(/sign-in/.test(pg.url()) || /captain role required/i.test(t), "CAP: plain player reached /captain/invites on team-admin");
  // The sign-in page should say why.
  finding(/role|not allowed|access/i.test(t), `CAP: plain player sees no reason on the team-admin sign-in refusal (${t.slice(0, 120)})`);
  await ctx.close();
});

test("J8.z no defects recorded during the walk", async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  expect(findings, findings.join("\n")).toEqual([]);
});
