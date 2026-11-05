import { execFileSync, spawnSync } from "node:child_process";
const files = execFileSync("git", ["ls-files", "-z", "packages/kernel/src", "packages/scheduler-core/src", "apps/superadmin-api/src"], { encoding: "utf8" })
  .split("\0").filter(file => file.endsWith(".test.ts") && !file.endsWith(".staging.test.ts"));
if (!files.length) throw new Error("No tracked business-rule tests found");
const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "apps/superadmin-api/tsconfig.json", "--test", ...files], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
