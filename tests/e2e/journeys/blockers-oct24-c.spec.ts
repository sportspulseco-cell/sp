import { test, expect } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, signedInAs, stagingSql } from "./_helpers";

/**
 * Follow-ups to SP-Changes (1), 24 Oct 2026: real profile photo upload,
 * and org admins editing their own organisation. Staging, browser.
 */
test.skip(!IS_STAGING, "staging only");

/** A valid 64x64 PNG (solid colour) built in memory. */
function png(): Buffer {
  const w = 64, h = 64;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 40; raw[o + 1] = 120; raw[o + 2] = 220;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("player uploads a profile photo; it is stored, previewed, saved and served", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const { page, context } = await signedInAs(browser, "player");
  page.on("response", (r) => {
    if (r.status() >= 400 && /staging-api/.test(r.url())) console.log(`[photo] ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  await page.goto(`${E2E_URLS.player}/profile`);
  await expect(page.getByText("Emergency contact name").first()).toBeVisible({ timeout: 30_000 });

  await page.getByLabel(/^Photo \/ avatar/).setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByText("Photo uploaded. Save to keep it.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible({ timeout: 20_000 });

  const [row] = await stagingSql<{ photo: string; person_photo: string | null }>(
    `select metadata->'roleProfile'->'player'->>'photoUrl' photo,
       (select photo_url from persons where user_id = profiles.id limit 1) person_photo
     from profiles where email = 'staging-player@sportspulse.us'`
  );
  expect(row?.photo).toMatch(/^https:\/\/.+\/storage\/v1\/object\/public\/avatars\//);
  if (row?.person_photo !== null) expect(row?.person_photo).toBe(row?.photo);

  // The stored file is served as an image (via the page, so DNS pinning applies).
  const served = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, type: r.headers.get("content-type") };
  }, row!.photo);
  expect(served.status).toBe(200);
  expect(served.type).toMatch(/^image\//);

  // Same surface after reload: the preview shows the saved photo.
  await page.reload();
  await expect(page.locator(`img[src="${row!.photo}"]`)).toBeVisible({ timeout: 20_000 });
  console.log(`[photo] stored ${row!.photo} served=${JSON.stringify(served)}`);
  await context.close();
});

test("org admin opens Organisation and edits their own organisation", async ({ browser }) => {
  test.setTimeout(180_000);
  const [before] = await stagingSql<{ id: string; legal_name: string }>(
    `select o.id, o.legal_name from orgs o where o.id = 'f7e62723-7685-4ba0-80e5-310c266c7b81'`
  );
  const changed = `${before!.legal_name} (edited ${Date.now().toString(36)})`;
  const { page, context } = await signedInAs(browser, "orgAdmin");
  try {
    await page.goto(`${E2E_URLS.orgAdmin}/organization`);
    await expect(page.getByRole("link", { name: "Organisation" }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Edit organisation" }).click();
    await page.getByLabel("Legal name", { exact: true }).fill(changed);
    await page.getByRole("button", { name: "Save organisation" }).click();
    await expect(page.getByText(changed).first()).toBeVisible({ timeout: 20_000 });
    const [after] = await stagingSql<{ legal_name: string }>(`select legal_name from orgs where id = $1`, [before!.id]);
    expect(after?.legal_name).toBe(changed);
    console.log("[org] org admin saved the organisation");
  } finally {
    await stagingSql(`update orgs set legal_name = $2 where id = $1`, [before!.id, before!.legal_name]);
    await context.close();
  }
});
