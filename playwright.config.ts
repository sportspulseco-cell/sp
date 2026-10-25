import { defineConfig, devices } from "@playwright/test";

/**
 * SportsPulse end-to-end smoke + regression suite.
 *
 * Drives the deployed Vercel apps (or local dev when E2E_TARGET=local).
 * The smoke users live in the prod database and were created by the
 * .playwright-mcp/create-smoke-users.py script — credentials in
 * the README; password rotation should re-run that script.
 *
 * Tests live in tests/e2e/, grouped by app. Tests should be:
 *   - independent (no order dependency)
 *   - readonly when possible (writes that mutate state are tagged
 *     [mutating] and reset their own state)
 *   - resilient to fresh-DB state (assert "rendered" not "specific row")
 *
 * Run: `pnpm test:e2e` (CI), `pnpm test:e2e:ui` (local debug).
 */

const TARGET = process.env.E2E_TARGET ?? "prod";
const supabaseIp = process.env.E2E_SUPABASE_IP;
if (supabaseIp && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(supabaseIp)) {
  throw new Error("E2E_SUPABASE_IP must be an IPv4 address");
}

const PROD_URLS = {
  landing: "https://sportspulse.us",
  league: "https://league.sportspulse.us",
  superadmin: "https://superadmin.sportspulse.us",
  orgAdmin: "https://org.sportspulse.us",
  teamAdmin: "https://team.sportspulse.us",
  player: "https://player.sportspulse.us"
};

const STAGING_URLS = {
  landing: "https://staging.sportspulse.us",
  league: "https://staging-league.sportspulse.us",
  superadmin: "https://staging-superadmin.sportspulse.us",
  orgAdmin: "https://staging-org.sportspulse.us",
  teamAdmin: "https://staging-team.sportspulse.us",
  player: "https://staging-player.sportspulse.us"
};

const LOCAL_URLS = {
  landing: "http://localhost:3000",
  league: "http://localhost:3001",
  superadmin: "http://localhost:3001",
  orgAdmin: "http://localhost:3003",
  player: "http://localhost:3004",
  teamAdmin: "http://localhost:3005"
};

/**
 * Parallel runs (one per journey) need their own output dir and bypass
 * cookie file, or one run's cleanup deletes another run's state.
 */
export const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR ?? "test-results";
export const BYPASS_STATE_PATH = `${OUTPUT_DIR}-state/staging-bypass-state.json`;

/**
 * E2E_TARGET=staging with E2E_LOCAL_APPS=1: the same staging data, users
 * and database checks, but the browser drives locally built role apps
 * (`next build && next start`, pointed at staging Supabase and a local
 * API). For proving a change before it can be deployed to staging.
 * Ports: superadmin 3141 (league admins too), org 3142, team 3143,
 * player 3140. Landing stays on staging.
 */
const LOCAL_STAGING_URLS = {
  landing: STAGING_URLS.landing,
  league: "http://localhost:3141",
  superadmin: "http://localhost:3141",
  orgAdmin: "http://localhost:3142",
  teamAdmin: "http://localhost:3143",
  player: "http://localhost:3140"
};

export const E2E_URLS =
  TARGET === "local"
    ? LOCAL_URLS
    : TARGET === "staging"
      ? process.env.E2E_LOCAL_APPS === "1"
        ? LOCAL_STAGING_URLS
        : STAGING_URLS
      : PROD_URLS;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: OUTPUT_DIR,
  globalSetup: TARGET === "staging" ? "./tests/e2e/staging-setup.ts" : undefined,
  // Generous timeout for cold-start Vercel pages; CI bumps further.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    storageState: TARGET === "staging" ? BYPASS_STATE_PATH : undefined,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: supabaseIp
          ? { args: [`--host-resolver-rules=MAP *.supabase.co ${supabaseIp}`] }
          : undefined
      }
    }
  ]
});
