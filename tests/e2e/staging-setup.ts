import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const protectedApps = [
  ["landing", "https://staging.sportspulse.us"],
  ["superadmin", "https://staging-superadmin.sportspulse.us"],
  ["superadmin", "https://staging-league.sportspulse.us"],
  ["org", "https://staging-org.sportspulse.us"],
  ["team", "https://staging-team.sportspulse.us"],
  ["player", "https://staging-player.sportspulse.us"]
] as const;

export default async function setup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    for (const [name, baseUrl] of protectedApps) {
      const secret = process.env[`STAGING_VERCEL_BYPASS_${name.toUpperCase()}`];
      if (!secret) throw new Error(`Missing staging Vercel bypass for ${name}`);
      const url = new URL("/sign-in", baseUrl);
      url.searchParams.set("x-vercel-protection-bypass", secret);
      url.searchParams.set("x-vercel-set-bypass-cookie", "true");
      const page = await context.newPage();
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      if (page.url().includes("vercel.com/sso-api")) {
        throw new Error(`Vercel preview protection blocked ${name}`);
      }
      await page.close();
    }
    await mkdir("test-results", { recursive: true });
    await context.storageState({ path: "test-results/staging-bypass-state.json" });
  } finally {
    await browser.close();
  }
}
