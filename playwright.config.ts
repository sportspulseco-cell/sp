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

const PROD_URLS = {
  landing: "https://sportspulse.us",
  league: "https://league.sportspulse.us",
  superadmin: "https://superadmin.sportspulse.us",
  orgAdmin: "https://org.sportspulse.us",
  teamAdmin: "https://team.sportspulse.us",
  player: "https://player.sportspulse.us"
};

const LOCAL_URLS = {
  landing: "http://localhost:3000",
  league: "http://localhost:3001",
  superadmin: "http://localhost:3001",
  orgAdmin: "http://localhost:3003",
  player: "http://localhost:3004",
  teamAdmin: "http://localhost:3005"
};

export const E2E_URLS = TARGET === "local" ? LOCAL_URLS : PROD_URLS;

export default defineConfig({
  testDir: "./tests/e2e",
  // Generous timeout for cold-start Vercel pages; CI bumps further.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
