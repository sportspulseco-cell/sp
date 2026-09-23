import { test, E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";

// Every non-parameterized authenticated page in the four role workspaces.
// Keep this explicit so a new route must be reviewed and added deliberately.
const workspaces = [
  {
    name: "superadmin",
    base: E2E_URLS.superadmin,
    email: SMOKE_USERS.superAdmin,
    paths: ["/admin", "/audit", "/communications", "/communications/templates", "/dashboard", "/data-migration", "/division-applications", "/divisions", "/documents", "/eligibility", "/finance", "/finance/ar", "/finance/create", "/forms", "/game-events", "/games", "/leagues", "/no-show-report", "/org-setup", "/organizations", "/payments", "/persons", "/registrations", "/reports", "/roles", "/rosters", "/scheduling", "/seasons", "/stats", "/teams", "/teams/new", "/transfers", "/users", "/venues"]
  },
  {
    name: "organization",
    base: E2E_URLS.orgAdmin,
    email: SMOKE_USERS.orgAdmin,
    paths: ["/", "/audit", "/communications", "/communications/compose", "/disputes", "/divisions", "/finance", "/finance/create", "/forms", "/leagues", "/org-setup", "/registrations", "/scheduling", "/seasons", "/teams", "/teams/new", "/venues"]
  },
  {
    name: "team",
    base: E2E_URLS.teamAdmin,
    email: SMOKE_USERS.teamAdmin,
    paths: ["/", "/captain/compliance", "/captain/dues", "/captain/free-agents", "/captain/invites", "/captain/join-requests", "/captain/register", "/captain/roster", "/captain/store", "/captain/team", "/comms", "/lineups", "/roster", "/schedule", "/stats"]
  },
  {
    name: "player",
    base: E2E_URLS.player,
    email: SMOKE_USERS.player,
    paths: ["/", "/compliance", "/notifications", "/notifications/settings", "/payments", "/profile", "/register", "/register/free-agent", "/registrations", "/schedule", "/stats", "/store", "/team", "/video"]
  }
] as const;

for (const workspace of workspaces) {
  test(`${workspace.name}: all static routes load in one signed-in session`, async ({ page }) => {
    test.setTimeout(600_000);
    await signIn(page, workspace.base, workspace.email);
    const failures: string[] = [];
    const timings: { path: string; ms: number }[] = [];

    const paths = process.env.E2E_ROUTE
      ? workspace.paths.filter((path) => path === process.env.E2E_ROUTE)
      : workspace.paths;
    for (const path of paths) {
      const started = Date.now();
      try {
        const response = await page.goto(`${workspace.base}${path}`, { timeout: 30_000 });
        // This legacy path redirects from a Server Component after the
        // document response, so wait for it before starting the next visit.
        if (workspace.name === "superadmin" && path === "/finance/ar") {
          await page.waitForURL(`${workspace.base}/finance`);
        }
        const ms = Date.now() - started;
        timings.push({ path, ms });
        const status = response?.status() ?? 0;
        const url = new URL(page.url());
        const body = await page.locator("body").innerText();
        if (status >= 400 || url.pathname.startsWith("/sign-in") ||
            body.includes("We couldn't load this page") || body.includes("Application error")) {
          failures.push(`${path}: HTTP ${status}, landed on ${url.pathname}; ${body.slice(0, 220).replace(/\s+/g, " ")}`);
        }
      } catch (error) {
        failures.push(`${path}: ${(error as Error).message.split("\n")[0]}`);
      }
    }

    const slowest = timings.sort((a, b) => b.ms - a.ms).slice(0, 5);
    console.log(`${workspace.name}: ${workspace.paths.length} routes; slowest ${slowest.map((x) => `${x.path} ${x.ms}ms`).join(", ")}`);
    if (failures.length) throw new Error(`${workspace.name} route failures:\n${failures.join("\n")}`);
  });
}
