import { test, E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";

type LinkPlan = { list: string; detail: RegExp };

const workspaces: {
  name: string;
  base: string;
  email: string;
  links: LinkPlan[];
  scheduling: boolean;
}[] = [
  {
    name: "superadmin",
    base: E2E_URLS.superadmin,
    email: SMOKE_USERS.superAdmin,
    links: [
      { list: "/organizations", detail: /^\/organizations\/[0-9a-f-]{36}$/ },
      { list: "/users", detail: /^\/users\/[0-9a-f-]{36}$/ },
      { list: "/persons", detail: /^\/persons\/[0-9a-f-]{36}$/ },
      { list: "/leagues", detail: /^\/leagues\/[0-9a-f-]{36}$/ },
      { list: "/seasons", detail: /^\/seasons\/[0-9a-f-]{36}$/ },
      { list: "/divisions", detail: /^\/divisions\/[0-9a-f-]{36}$/ },
      { list: "/teams", detail: /^\/teams\/[0-9a-f-]{36}$/ },
      { list: "/games", detail: /^\/games\/[0-9a-f-]{36}$/ },
      { list: "/forms", detail: /^\/forms\/[0-9a-f-]{36}$/ },
      { list: "/finance", detail: /^\/finance\/[0-9a-f-]{36}$/ },
      { list: "/audit", detail: /^\/audit\/[0-9a-f-]{36}$/ },
      { list: "/documents", detail: /^\/documents\/[0-9a-f-]{36}$/ }
    ],
    scheduling: true
  },
  {
    name: "organization",
    base: E2E_URLS.orgAdmin,
    email: SMOKE_USERS.orgAdmin,
    links: [
      { list: "/leagues", detail: /^\/leagues\/[0-9a-f-]{36}$/ },
      { list: "/seasons", detail: /^\/seasons\/[0-9a-f-]{36}$/ },
      { list: "/divisions", detail: /^\/divisions\/[0-9a-f-]{36}$/ },
      { list: "/teams", detail: /^\/teams\/[0-9a-f-]{36}$/ },
      { list: "/forms", detail: /^\/forms\/[0-9a-f-]{36}$/ },
      { list: "/audit", detail: /^\/audit\/[0-9a-f-]{36}$/ }
    ],
    scheduling: true
  },
  {
    name: "team",
    base: E2E_URLS.teamAdmin,
    email: SMOKE_USERS.teamAdmin,
    links: [
      { list: "/lineups", detail: /^\/lineups\/[0-9a-f-]{36}$/ },
      { list: "/captain/register", detail: /^\/captain\/register\/[0-9a-f-]{36}$/ }
    ],
    scheduling: false
  },
  {
    name: "player",
    base: E2E_URLS.player,
    email: SMOKE_USERS.player,
    links: [
      { list: "/registrations", detail: /^\/registrations\/[0-9a-f-]{36}$/ },
      { list: "/register", detail: /^\/register\/[0-9a-f-]{36}$/ }
    ],
    scheduling: false
  }
];

const schedulingViews = [
  "conflicts", "fairness", "generate", "parity", "playoffs",
  "rinks", "runs", "tournament", "verify"
];

for (const workspace of workspaces) {
  test(`${workspace.name}: linked detail and schedule routes`, async ({ page }) => {
    test.setTimeout(600_000);
    await signIn(page, workspace.base, workspace.email);
    const failures: string[] = [];
    const missingFixtures: string[] = [];
    let visited = 0;

    async function check(path: string) {
      const response = await page.goto(`${workspace.base}${path}`, { timeout: 30_000 });
      const status = response?.status() ?? 0;
      const body = await page.locator("body").innerText();
      if (status >= 400 || page.url().includes("/sign-in") ||
          body.includes("We couldn't load this page") || body.includes("Application error")) {
        failures.push(`${path}: HTTP ${status}, landed on ${new URL(page.url()).pathname}`);
      }
      visited++;
    }

    async function firstMatchingLink(plan: LinkPlan): Promise<string | null> {
      await page.goto(`${workspace.base}${plan.list}`);
      const hrefs = await page.locator("a[href]").evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? "")
      );
      return hrefs.map((href) => new URL(href, workspace.base).pathname)
        .find((path) => plan.detail.test(path)) ?? null;
    }

    for (const plan of workspace.links) {
      const path = await firstMatchingLink(plan);
      if (!path) {
        missingFixtures.push(plan.detail.source);
        continue;
      }
      try { await check(path); }
      catch (error) { failures.push(`${path}: ${(error as Error).message.split("\n")[0]}`); }
    }

    if (workspace.scheduling) {
      const seasonPath = await firstMatchingLink({
        list: "/seasons", detail: /^\/seasons\/[0-9a-f-]{36}$/
      });
      if (seasonPath) {
        const seasonId = seasonPath.split("/")[2];
        for (const view of schedulingViews) {
          const path = `/scheduling/${seasonId}/${view}`;
          try { await check(path); }
          catch (error) { failures.push(`${path}: ${(error as Error).message.split("\n")[0]}`); }
        }
      } else {
        missingFixtures.push("scheduling season");
      }
    }

    console.log(`${workspace.name}: ${visited} detail pages visited; ${missingFixtures.length} missing fixture links`);
    if (missingFixtures.length) console.log(`Missing fixtures: ${missingFixtures.join(", ")}`);
    if (failures.length) throw new Error(failures.join("\n"));
  });
}
