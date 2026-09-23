import { setTimeout as sleep } from "node:timers/promises";

const token = process.env.VERCEL_TOKEN;
const sha = process.env.GITHUB_SHA;
if (!token || !sha) {
  throw new Error("VERCEL_TOKEN and GITHUB_SHA are required");
}

const teamId = "team_WRP21WGTEydldgBkZVYsF7rz";
const projects = new Map([
  ["api", "prj_Mgh67S9r2GntrQepXKU6m2JLB6y5"],
  ["player", "prj_WBHB41FXCNyWaTpMuIkHsho9ViyP"],
  ["org", "prj_p0oWDKaGZclHVgQ1DC0BHtazKlEm"],
  ["team", "prj_YtswhloUl9fI5YGBrMLCUyCWfmgN"],
  ["superadmin", "prj_htg83upgsw9xoJgyavkyqB6JRod0"],
  ["landing", "prj_edfyHGkT3Wvrv2PdZLt6sJ861H03"]
]);

async function latest(name, projectId) {
  const query = new URLSearchParams({ projectId, target: "production", teamId, limit: "10" });
  const response = await fetch(`https://api.vercel.com/v6/deployments?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Vercel lookup for ${name} failed: HTTP ${response.status}`);
  const body = await response.json();
  return body.deployments ?? [];
}

const deadline = Date.now() + 20 * 60_000;
while (Date.now() < deadline) {
  const status = await Promise.all(
    [...projects].map(async ([name, id]) => ({ name, deployments: await latest(name, id) }))
  );
  const pending = [];
  for (const { name, deployments } of status) {
    const deployment = deployments.find((item) => item.meta?.githubCommitSha === sha);
    const state = deployment?.readyState ?? "MISSING";
    if (state === "ERROR") {
      throw new Error(`${name} deployment for ${sha.slice(0, 7)} ended in ERROR`);
    }
    if (state === "CANCELED") {
      const skipped = deployment.errorMessage?.includes("didn’t affect this project") ||
        deployment.errorMessage?.includes("didn't affect this project");
      const previousReady = deployments.some((item) => item.readyState === "READY");
      if (!skipped || !previousReady) {
        throw new Error(`${name} deployment for ${sha.slice(0, 7)} ended in CANCELED: ${deployment.errorMessage ?? "unknown reason"}`);
      }
      continue;
    }
    if (state !== "READY") pending.push(`${name}:${state === "MISSING" ? "WAITING" : state}`);
  }
  if (pending.length === 0) {
    console.log(`All ${projects.size} production deployments are ready for ${sha.slice(0, 7)}.`);
    process.exit(0);
  }
  console.log(`Waiting for ${sha.slice(0, 7)}: ${pending.join(", ")}`);
  await sleep(15_000);
}
throw new Error(`Production deployments did not become ready for ${sha.slice(0, 7)} within 20 minutes`);
