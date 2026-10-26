import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { IS_STAGING, RUN_TAG, openNav, signedInAs, stagingSql, watchErrors } from "./_helpers";

/**
 * J9 · Eligibility and documents (UC-05, UC-27, UC-29).
 *
 * player @ PL /compliance  → sees requirements, submits USA Hockey ID
 * super_admin @ SA /documents → review queue? + creates/publishes a waiver template
 * super_admin @ SA /eligibility → season sweep, then a decision (waive)
 * captain @ TA /captain/compliance → reflects the decision for the player
 * player @ PL /compliance + /notifications → sees the decision
 * league_admin @ SA /eligibility → UC actor can reach the queue
 *
 * The walk is serial (one sign-in per role). Product bugs are collected
 * with `check()` and reported together by the last test, so one bug does
 * not hide the rest. Hard `expect` is only used where the next step
 * cannot run without it. Bug ids: doc/testing/bugs/compliance.md.
 */

test.skip(!IS_STAGING, "J9 mutates data: staging only");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const OUT = resolve(process.env.E2E_OUTPUT_DIR ?? "test-results-compliance", "j09-evidence");
const PLAYER_NAME = "Staging Player";
const SEASON_NAME = "Staging 2026-27";

let player: { context: BrowserContext; page: Page; app: string };
let admin: { context: BrowserContext; page: Page; app: string };
let captain: { context: BrowserContext; page: Page; app: string };
const errs: Record<string, string[]> = {};
const findings: string[] = [];
let playerPersonId = "";
let seasonId = "";
/** COMP-3/COMP-1 need migration 0054 on staging (the owner applies it). */
let documentsTableReady = false;
const DOCUMENTS_SKIP_REASON =
  "Migration 0054_compliance_document_submissions is not applied on staging yet, so COMP-3 / COMP-1 cannot run. Apply it with: pnpm --filter @sportspulse/db migrate --target=staging";
let firstUploadId = "";
let secondUploadId = "";
const REJECT_REASON = `${RUN_TAG} Photo is blurry, upload a sharper scan`;

/** CRC-32 for PNG chunks. */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A real, unique PNG (64x40, one colour per variant, RUN_TAG in a tEXt
 * chunk) so every run uploads a file the API has never seen.
 */
function testPng(variant: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const w = 64;
  const h = 40;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rgb = variant === 1 ? [200, 40, 40] : [40, 140, 60];
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from(`Comment\0${RUN_TAG} J9 document ${variant}`, "latin1")),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function check(ok: boolean, msg: string) {
  if (!ok) findings.push(msg);
}

/**
 * After a full page load, React can still hold a streamed segment in a
 * hidden <div id="S:n"> at the end of <body> while the page already shows
 * it, so the DOM briefly has a second, hidden copy with the same ids
 * (26 Oct probe: org /registrations 3 of 12 loads, gone within 300 ms;
 * J09 run 2 hit it on player /compliance). Users never see it; id
 * locators do. Wait for it to be gone before selecting by id.
 */
async function streamed(page: Page) {
  await expect(page.locator('body > div[hidden][id^="S:"]')).toHaveCount(0, { timeout: 15_000 });
}

async function snap(page: Page, name: string): Promise<string> {
  mkdirSync(OUT, { recursive: true });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  const txt = await page.locator("main").first().innerText({ timeout: 15_000 }).catch(() => "");
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20_000 }).catch(() => {});
  writeFileSync(`${OUT}/${name}.txt`, `URL ${page.url()}\n\n${txt}`);
  return txt;
}

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000);
  player = await signedInAs(browser, "player");
  errs.player = watchErrors(player.page);
  admin = await signedInAs(browser, "superAdmin");
  errs.admin = watchErrors(admin.page);
  captain = await signedInAs(browser, "teamAdmin");
  errs.captain = watchErrors(captain.page);
  const [p] = await stagingSql<{ id: string }>(
    `select p.id from persons p join auth.users u on u.id = p.user_id where u.email = 'staging-player@sportspulse.us'`
  );
  playerPersonId = p?.id ?? "";
  const [s] = await stagingSql<{ id: string }>(`select id from seasons where name = $1`, [SEASON_NAME]);
  seasonId = s?.id ?? "";
  const [t] = await stagingSql<{ t: string | null }>(
    `select to_regclass('public.compliance_document_submissions')::text t`
  );
  documentsTableReady = !!t?.t;
});

test.afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/errors.json`, JSON.stringify(errs, null, 2));
  writeFileSync(`${OUT}/findings.txt`, findings.join("\n"));
  await Promise.all([player?.context.close(), admin?.context.close(), captain?.context.close()]);
});

test("1 player finds /compliance from the sidebar", async () => {
  const { page, app } = player;
  await page.goto(app + "/");
  await page.getByRole("link", { name: /^Waivers & documents$/ }).first().click();
  await expect(page).toHaveURL(/\/compliance$/);
  await expect(page.getByRole("heading", { name: "Waivers & documents" })).toBeVisible();
  const txt = await snap(page, "01-player-compliance-before");

  // UC-29 precondition: player uploads ID / eligibility proof.
  const fileInputs = await page.locator("input[type=file]").count();
  check(fileInputs > 0, "COMP-3: /compliance has no file upload for an ID or eligibility document");

  // UC-27 / COMP-4: the player's registration documents are listed, each
  // signed or with a Sign action (staging-player has a registration).
  await expect(page.getByRole("heading", { name: "Registration waivers" })).toBeVisible();
  await expect(page.getByText(/Liability waiver/).first()).toBeVisible();
  const signButtons = await page.getByRole("button", { name: /^Sign$/ }).count();
  const allSigned = await page.getByText(/All signed/i).count();
  expect(signButtons > 0 || allSigned > 0, "COMP-4: each waiver is signed or has a Sign action").toBe(true);
  writeFileSync(`${OUT}/01-controls.txt`, `fileInputs=${fileInputs} signButtons=${signButtons}\n\n${txt}`);
});

test("2 player submits a USA Hockey ID (validation + happy path)", async () => {
  const { page } = player;
  await page.getByRole("button", { name: /Update USA Hockey ID/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Submit your USA Hockey ID")).toBeVisible();

  await dialog.locator("#usa-hockey-id").fill("ab");
  await dialog.getByRole("button", { name: /^Submit$/ }).click();
  await page.waitForTimeout(500);
  const shortText = await dialog.innerText();
  writeFileSync(`${OUT}/02-dialog-short.txt`, shortText);

  await dialog.locator("#usa-hockey-id").fill("ABC1234567");
  await dialog.getByRole("button", { name: /^Submit$/ }).click();
  await page.waitForTimeout(3000);
  const dlgText = (await dialog.isVisible().catch(() => false))
    ? await dialog.innerText()
    : "(dialog closed)";
  await page.screenshot({ path: `${OUT}/02-player-usah-submit.png`, fullPage: true });
  writeFileSync(`${OUT}/02-dialog-submit.txt`, dlgText);
  check(
    /Submitted|dialog closed/.test(dlgText),
    `COMP-2: USA Hockey ID submit failed. Dialog says: ${dlgText.replace(/\s+/g, " ").slice(0, 300)}`
  );

  const rows = await stagingSql(
    `select external_id, status, source from identity_verifications where person_id = $1`,
    [playerPersonId]
  );
  writeFileSync(`${OUT}/02-db-identity_verifications.json`, JSON.stringify(rows, null, 2));
  check(rows.length > 0, "COMP-2: no identity_verifications row written for the player");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /Cancel/i }).click({ timeout: 5_000 }).catch(() => {});
  }
});

test("3 super_admin finds the document review queue on /eligibility (UC-29)", async () => {
  const { page, app } = admin;
  // /documents stays waiver-template authoring; the review queue sits on
  // Eligibility, where the operator decides whether a player is cleared.
  await page.goto(app + "/dashboard");
  await openNav(page, /^Eligibility$/);
  await expect(page).toHaveURL(/\/eligibility/);
  await expect(page.getByRole("heading", { name: "Documents to review" })).toBeVisible();
  const elig = await snap(page, "03-sa-eligibility-before");
  const review = await page.getByRole("button", { name: /^Review$/ }).count();
  writeFileSync(`${OUT}/03-eligibility-controls.txt`, `reviewButtons=${review}\n\n${elig}`);
});

test("3a COMP-3 player uploads an ID document from /compliance", async () => {
  test.skip(!documentsTableReady, DOCUMENTS_SKIP_REASON);
  const { page, app } = player;
  await page.goto(app + "/compliance");
  await streamed(page);
  await expect(page.getByRole("heading", { name: "ID and eligibility documents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload a document" })).toBeVisible();

  // One upload form once streaming is done (see streamed()). If a second
  // #upload-target ever shows up after that, keep where each one sits.
  const targets = await page.locator("#upload-target").evaluateAll((els) =>
    els.map((el) => {
      const path: string[] = [];
      for (let n: Element | null = el; n && n.tagName !== "BODY"; n = n.parentElement) {
        path.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.hasAttribute("hidden") ? "[hidden]" : ""}`);
      }
      return { path: path.join(" < "), visible: el.getClientRects().length > 0, options: el.textContent };
    })
  );
  writeFileSync(`${OUT}/03a-upload-targets.json`, JSON.stringify({ url: page.url(), targets }, null, 2));
  expect(targets.length, "player /compliance renders one upload form (one #upload-target)").toBe(1);

  // The season picker lists the player's own registrations and team seasons.
  const option = page.locator("#upload-target option", { hasText: SEASON_NAME }).first();
  await expect(option, "the team season is offered as an upload target").toHaveCount(1);
  await page.locator("#upload-target").selectOption((await option.getAttribute("value"))!);
  // Kind dropdown is the kernel enum with plain labels and no default.
  await expect(page.locator("#upload-kind")).toHaveValue("");
  const kindLabels = await page.locator("#upload-kind option").allInnerTexts();
  expect(kindLabels).toEqual([
    "Choose a type",
    "Birth certificate",
    "USA Hockey or other governing-body card",
    "Government photo ID",
    "Signed waiver (scanned)",
    "Other document"
  ]);
  await page.locator("#upload-kind").selectOption("birth_certificate");
  const file1 = testPng(1);
  await page
    .locator("#upload-file")
    .setInputFiles({ name: `${RUN_TAG}-birth-certificate.png`, mimeType: "image/png", buffer: file1 });
  await page.getByRole("button", { name: /^Upload$/ }).click();
  await expect(page.getByText(/Uploaded\. Status: Waiting for review/)).toBeVisible({ timeout: 30_000 });
  await snap(page, "03a-player-uploaded");

  const rows = await stagingSql<{
    id: string;
    status: string;
    kind: string;
    season_id: string;
    content_type: string;
    storage_path: string;
    size_bytes: number;
  }>(
    `select id, status, kind, season_id, content_type, storage_path, size_bytes
       from compliance_document_submissions where person_id = $1 and sha256 = $2`,
    [playerPersonId, sha256(file1)]
  );
  writeFileSync(`${OUT}/03a-db-submission.json`, JSON.stringify(rows, null, 2));
  expect(rows.length, "exactly one submission row for the uploaded file").toBe(1);
  expect(rows[0]).toMatchObject({
    status: "pending",
    kind: "birth_certificate",
    season_id: seasonId,
    content_type: "image/png",
    size_bytes: file1.length
  });
  expect(rows[0]!.storage_path.startsWith(`${playerPersonId}/`)).toBe(true);
  firstUploadId = rows[0]!.id;

  // Same surface, no reload: the new row is listed with its server status.
  const li = page.locator(`li[data-submission-id="${firstUploadId}"]`);
  await expect(li).toContainText("Birth certificate");
  await expect(li).toContainText("Waiting for review");

  // Replay: the same file again is the same submission, not a second row.
  await page.locator("#upload-kind").selectOption("birth_certificate");
  await page.locator("#upload-file").setInputFiles({ name: "again.png", mimeType: "image/png", buffer: file1 });
  await page.getByRole("button", { name: /^Upload$/ }).click();
  await expect(page.getByText(/You already sent this file/)).toBeVisible({ timeout: 30_000 });
  const again = await stagingSql<{ n: number }>(
    `select count(*)::int n from compliance_document_submissions where person_id = $1 and sha256 = $2`,
    [playerPersonId, sha256(file1)]
  );
  expect(again[0]?.n).toBe(1);
});

test("3b COMP-1 super_admin reviews the upload and rejects it with a reason", async () => {
  test.skip(!documentsTableReady || !firstUploadId, DOCUMENTS_SKIP_REASON);
  const { page, app } = admin;
  await page.goto(app + "/eligibility");
  await streamed(page);
  const row = page.locator(`tr[data-submission-id="${firstUploadId}"]`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(PLAYER_NAME);
  await expect(row).toContainText("Birth certificate");
  await expect(row).toContainText("Waiting for review");
  await row.getByRole("button", { name: /^Review$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`Birth certificate: ${PLAYER_NAME}`)).toBeVisible();
  // The file opens through a short-lived signed link from the private bucket.
  const link = dialog.getByRole("link", { name: /Open the file/ });
  await expect(link).toBeVisible({ timeout: 20_000 });
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/\/storage\/v1\/object\/sign\/compliance-documents\//);
  const fileRes = await page.request.get(href);
  expect(fileRes.status()).toBe(200);
  expect(sha256(Buffer.from(await fileRes.body()))).toBe(sha256(testPng(1)));
  await expect(dialog.locator("img")).toBeVisible();
  await snap(page, "03b-sa-review-dialog");

  // Reject needs a reason the player can act on.
  await dialog.getByRole("button", { name: /^Reject$/ }).click();
  await expect(dialog.getByText("Give the player a reason for the rejection.")).toBeVisible();
  await dialog.locator("#document-decision-reason").fill(REJECT_REASON);
  await dialog.getByRole("button", { name: /^Reject$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  // Same surface, no reload: the row shows the server's new status.
  await expect(row).toContainText("Rejected");
  await expect(row).toContainText(REJECT_REASON);
  await snap(page, "03b-sa-after-reject");

  const db = await stagingSql<{ status: string; decisions: unknown }>(
    `select s.status,
            (select json_agg(json_build_object('decision', d.decision, 'reason', d.reason))
               from compliance_document_decisions d where d.submission_id = s.id) decisions
       from compliance_document_submissions s where s.id = $1`,
    [firstUploadId]
  );
  writeFileSync(`${OUT}/03b-db-after-reject.json`, JSON.stringify(db, null, 2));
  expect(db[0]?.status).toBe("rejected");
  expect(db[0]?.decisions).toEqual([{ decision: "rejected", reason: REJECT_REASON }]);
  const notes = await stagingSql<{ template_code: string; recipient_person_id: string; status: string }>(
    `select template_code, recipient_person_id, status from notifications where payload->>'submissionId' = $1`,
    [firstUploadId]
  );
  writeFileSync(`${OUT}/03b-db-notifications.json`, JSON.stringify(notes, null, 2));
  expect(
    notes.some(
      (n) => n.template_code === "compliance.document.decided" && n.recipient_person_id === playerPersonId
    ),
    "a decision notification is queued for the player"
  ).toBe(true);
});

test("3c COMP-3 player sees the reason and uploads a new file", async () => {
  test.skip(!documentsTableReady || !firstUploadId, DOCUMENTS_SKIP_REASON);
  const { page, app } = player;
  await page.goto(app + "/compliance");
  await streamed(page);
  const li = page.locator(`li[data-submission-id="${firstUploadId}"]`);
  await expect(li).toContainText("Rejected");
  await expect(li).toContainText(`Reason from the admin: ${REJECT_REASON}`);
  await snap(page, "03c-player-sees-reason");

  // "Upload a new file" pre-fills the form with the same season and type.
  await li.getByRole("button", { name: /Upload a new file/ }).click();
  await expect(page.locator("#upload-kind")).toHaveValue("birth_certificate");
  await expect(page.locator("#upload-target")).not.toHaveValue("");

  // The rejected file itself is refused, with the admin's reason.
  await page.locator("#upload-file").setInputFiles({ name: "same.png", mimeType: "image/png", buffer: testPng(1) });
  await page.getByRole("button", { name: /^Upload$/ }).click();
  await expect(page.getByText(/already sent this exact file .* was rejected/)).toBeVisible({ timeout: 30_000 });

  const file2 = testPng(2);
  await page
    .locator("#upload-file")
    .setInputFiles({ name: `${RUN_TAG}-birth-certificate-2.png`, mimeType: "image/png", buffer: file2 });
  await page.getByRole("button", { name: /^Upload$/ }).click();
  await expect(page.getByText(/Uploaded\. Status: Waiting for review/)).toBeVisible({ timeout: 30_000 });
  const rows = await stagingSql<{ id: string; status: string }>(
    `select id, status from compliance_document_submissions where person_id = $1 and sha256 = $2`,
    [playerPersonId, sha256(file2)]
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("pending");
  secondUploadId = rows[0]!.id;
  await expect(page.locator(`li[data-submission-id="${secondUploadId}"]`)).toContainText("Waiting for review");
});

test("3d COMP-1 admin approves the new file; player sees Approved and a notification", async () => {
  test.skip(!documentsTableReady || !secondUploadId, DOCUMENTS_SKIP_REASON);
  const { page, app } = admin;
  await page.goto(app + "/eligibility");
  await streamed(page);
  const row = page.locator(`tr[data-submission-id="${secondUploadId}"]`);
  await expect(row).toContainText("Waiting for review", { timeout: 15_000 });
  await row.getByRole("button", { name: /^Review$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /Open the file/ })).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: /^Approve$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(row).toContainText("Approved");
  const db = await stagingSql<{ status: string; n: number }>(
    `select s.status, (select count(*)::int from compliance_document_decisions d where d.submission_id = s.id) n
       from compliance_document_submissions s where s.id = $1`,
    [secondUploadId]
  );
  writeFileSync(`${OUT}/03d-db-after-approve.json`, JSON.stringify(db, null, 2));
  expect(db[0]).toEqual({ status: "approved", n: 1 });

  const p = player.page;
  await p.goto(player.app + "/compliance");
  await streamed(p);
  await expect(p.locator(`li[data-submission-id="${secondUploadId}"]`)).toContainText("Approved");
  await snap(p, "03d-player-approved");
  const navStart = Date.now();
  await p.getByRole("link", { name: /^Notifications$/ }).first().click();
  await expect(p).toHaveURL(/\/notifications/);
  // The URL changes while the loading skeleton shows; read the inbox once
  // the page itself has rendered, and keep how long that took.
  await expect(p.getByRole("heading", { name: /Notifications/ }).first()).toBeVisible({ timeout: 30_000 });
  writeFileSync(`${OUT}/03d-notifications-load-ms.txt`, String(Date.now() - navStart));
  const inbox = await snap(p, "03d-player-notifications");
  expect(inbox, "player inbox shows the document decision").toMatch(/Birth certificate/);
});

test("3e COMP-1 league_admin and org_admin see the queue for their scope", async ({ browser }) => {
  test.skip(!documentsTableReady || !secondUploadId, DOCUMENTS_SKIP_REASON);
  const la = await signedInAs(browser, "leagueAdmin");
  await la.page.goto(la.app + "/eligibility");
  await streamed(la.page);
  await la.page.locator("#document-queue-filter").selectOption("all");
  await expect(la.page.locator(`tr[data-submission-id="${secondUploadId}"]`)).toContainText("Approved", {
    timeout: 15_000
  });
  await snap(la.page, "03e-league-admin-queue");
  await la.context.close();

  const oa = await signedInAs(browser, "orgAdmin");
  await oa.page.goto(oa.app + "/registrations");
  await streamed(oa.page);
  await expect(oa.page.getByRole("heading", { name: "Documents to review" })).toBeVisible();
  await oa.page.locator("#document-queue-filter").selectOption("all");
  await expect(oa.page.locator(`tr[data-submission-id="${secondUploadId}"]`)).toContainText("Approved", {
    timeout: 15_000
  });
  await snap(oa.page, "03e-org-admin-queue");
  await oa.context.close();
});

test("4 super_admin creates and publishes a waiver template (UC-27 precondition)", async () => {
  const { page, app } = admin;
  await page.goto(app + "/documents");
  await page.getByRole("button", { name: /New document/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#kind").selectOption("waiver");
  const name = `${RUN_TAG} Liability waiver`;
  await dialog.locator("#name").fill(name);
  await dialog.getByRole("button", { name: /Create document/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const appeared = await page
    .getByRole("link", { name })
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  check(appeared, "J9-step4: new document did not appear in /documents without reload");
  if (!appeared) await page.reload();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("NO ACTIVE VERSION")).toBeVisible();
  await page.locator("#contentHtml").fill(`<p>${RUN_TAG} I accept the risks of hockey.</p>`);
  await page.getByRole("button", { name: /Publish version/i }).click();
  const active = await page
    .getByText(/ACTIVE · v1/)
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check(active, "J9-step4: published version not shown as ACTIVE v1 without reload");
  await snap(page, "04-sa-document-published");
  const rows = await stagingSql(
    `select d.name, d.active_version_id, (select count(*) from document_versions v where v.document_id = d.id)::int versions
       from documents d where d.name = $1`,
    [name]
  );
  writeFileSync(`${OUT}/04-db-documents.json`, JSON.stringify(rows, null, 2));
  expect(rows.length).toBe(1);
});

test("5 super_admin runs the season eligibility sweep, then decides on the player", async () => {
  const { page, app } = admin;
  await page.goto(app + "/eligibility");
  await streamed(page);
  // The season picker is the select that offers the season (the page also
  // has a document-status filter select now).
  await page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: SEASON_NAME }) })
    .first()
    .selectOption({ label: SEASON_NAME });
  const tableBefore = await page.locator("main").innerText();
  const prior = await stagingSql<{ status: string }>(
    `select status from eligibility_records where person_id = $1 and season_id = $2`,
    [playerPersonId, seasonId]
  );
  const waivedBeforeSweep = prior[0]?.status === "waived";
  const playerRow = () =>
    page.locator("tbody tr").filter({ has: page.locator(`a[href="/persons/${playerPersonId}"]`) });
  const rowsBefore = await playerRow().count();
  const rowTextBefore = rowsBefore ? await playerRow().first().innerText() : "";
  await page.getByRole("button", { name: /Run eligibility sweep/i }).click();
  await expect(page.getByText(/Eligibility sweep complete/)).toBeVisible({ timeout: 30_000 });
  const flash = await page.getByText(/Eligibility sweep complete/).innerText();
  await page.waitForTimeout(2000);
  const tableAfter = await page.locator("main").innerText();
  await snap(page, "05-sa-eligibility-after-sweep");
  writeFileSync(`${OUT}/05-sweep.txt`, `FLASH ${flash}\n\nBEFORE\n${tableBefore}\n\nAFTER\n${tableAfter}`);
  const rowsAfter = await playerRow().count();
  const rowTextAfter = rowsAfter ? await playerRow().first().innerText() : "";
  writeFileSync(`${OUT}/05-sweep-row.txt`, `BEFORE ${rowTextBefore}
AFTER ${rowTextAfter}`);
  check(
    rowsBefore === 0 ? rowsAfter > 0 : rowTextAfter !== rowTextBefore,
    "COMP-6: records table under the sweep bar does not refresh after the sweep (stale until reload)"
  );

  const recs = await stagingSql<{ status: string; rule_evaluation: unknown }>(
    `select status, rule_evaluation from eligibility_records where person_id = $1 and season_id = $2`,
    [playerPersonId, seasonId]
  );
  writeFileSync(`${OUT}/05-db-eligibility-after-sweep.json`, JSON.stringify(recs, null, 2));
  expect(recs.length, "sweep should write an eligibility record for the rostered player").toBe(1);
  if (waivedBeforeSweep) {
    // COMP-17 fixed: a sweep records its evaluation but never overwrites a waiver.
    expect(
      recs[0]?.status,
      `COMP-17: season sweep overwrote an admin waiver: status was 'waived' before the sweep, '${recs[0]?.status}' after`
    ).toBe("waived");
  }

  await page.reload();
  await streamed(page);
  const row = playerRow().filter({ hasText: SEASON_NAME }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const statusBefore = await row.innerText();
  // COMP-17 fixed: a waiver reason is shown only on a record that is waived.
  expect(
    recs[0]?.status !== "waived" && /verified offline/.test(statusBefore),
    `COMP-17: row shows status ${recs[0]?.status} together with a stale waiver reason from an earlier decision`
  ).toBe(false);
  check(
    statusBefore.includes(PLAYER_NAME),
    `COMP-9: /eligibility shows the person as a UUID fragment, not a name. Row: ${statusBefore.replace(/\s+/g, " ")}`
  );
  const newRecordEnabled = await page.getByRole("button", { name: /New record/ }).isEnabled();
  check(newRecordEnabled, "COMP-9: /eligibility 'New record' button is disabled (person list failed to load)");

  if (recs[0]?.status === "waived") {
    // An earlier run's waiver stands (COMP-17), and a waived row offers no
    // Waive action (there is no "revoke waiver" in the console), so the
    // decision is already on record: check the row shows it, do not click.
    test.info().annotations.push({
      type: "note",
      description: "J9-step5: record already waived by an earlier run; checked the standing decision, Waive not clicked"
    });
    await expect(row).toContainText(/waived/i);
    await expect(row).toContainText(/verified offline/);
    await expect(row.getByRole("button", { name: /^Waive$/ })).toHaveCount(0);
    writeFileSync(`${OUT}/05-row.txt`, `ALREADY WAIVED ${statusBefore}`);
  } else {
    await row.getByRole("button", { name: /^Waive$/ }).click({ timeout: 15_000 });
    const dialog = page.getByRole("dialog");
    await dialog.locator("#waive-reason").fill(`${RUN_TAG} ID verified offline`);
    await dialog.getByRole("button", { name: /Waive eligibility/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const sameSurface = await expect
      .poll(async () => playerRow().filter({ hasText: SEASON_NAME }).first().innerText(), { timeout: 10_000 })
      .toMatch(/waived/i)
      .then(() => true)
      .catch(() => false);
    const statusAfter = await playerRow().filter({ hasText: SEASON_NAME }).first().innerText();
    writeFileSync(`${OUT}/05-row.txt`, `BEFORE ${statusBefore}\nAFTER ${statusAfter}`);
    check(sameSurface, "J9-step5: /eligibility row still not 'waived' 10s after Waive (stale until reload)");
  }
  await snap(page, "05-sa-eligibility-after-waive");
  const after = await stagingSql<{ status: string; waiver_reason: string }>(
    `select status, waiver_reason from eligibility_records where person_id = $1 and season_id = $2`,
    [playerPersonId, seasonId]
  );
  writeFileSync(`${OUT}/05-db-eligibility-after-waive.json`, JSON.stringify(after, null, 2));
  expect(after[0]?.status).toBe("waived");
});

test("6 captain sees the player's status on /captain/compliance (cross-app)", async () => {
  const { page, app } = captain;
  await page.goto(app + "/");
  await openNav(page, /^Waivers & documents$/);
  await expect(page).toHaveURL(/\/captain\/compliance$/);
  const txt = await snap(page, "06-captain-compliance");
  check(
    !/No compliance records yet/.test(txt),
    "COMP-5: /captain/compliance shows 'No compliance records yet' although the DB has a waived record for a rostered player"
  );
  check(txt.includes(PLAYER_NAME), "COMP-5: /captain/compliance does not show the player by name");
});

test("7 player sees the decision on /compliance and a notification", async () => {
  const { page, app } = player;
  await page.goto(app + "/compliance");
  await streamed(page);
  const txt = await snap(page, "07-player-compliance-after");
  check(
    // The status badge is upper-case on screen, so innerText reads "WAIVED".
    !/No requirements yet/.test(txt) && /\bwaived\b/i.test(txt),
    "COMP-5: player /compliance shows 'No requirements yet' although the DB has a waived record for them"
  );
  await page.getByRole("link", { name: /^Notifications$/ }).first().click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByRole("heading", { name: /Notifications/ }).first()).toBeVisible();
  const notes = await snap(page, "07-player-notifications");
  check(/eligib|waiv/i.test(notes), "COMP-7: no notification to the player about the eligibility decision");
});

test("8 league_admin reaches /eligibility (UC-05/UC-29 actor)", async ({ browser }) => {
  const la = await signedInAs(browser, "leagueAdmin");
  const e = watchErrors(la.page);
  await la.page.goto(la.app + "/eligibility");
  await streamed(la.page);
  const txt = await snap(la.page, "08-league-admin-eligibility");
  writeFileSync(`${OUT}/08-errors.txt`, e.join("\n"));
  check(
    txt.includes(PLAYER_NAME) || txt.includes(playerPersonId.slice(0, 8)),
    "COMP-8: league_admin sees no eligibility records on /eligibility"
  );
  await la.context.close();
});

test("9 report findings", async () => {
  expect(findings, findings.join("\n")).toEqual([]);
});
