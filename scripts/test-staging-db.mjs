import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.STAGING_SUPABASE_REF !== "panwqcxwtugfqekxnqsr") throw new Error("Explicit SportsPulse staging database required");
const files = process.argv.slice(2);
if (!files.length || files.some(file => !file.startsWith("apps/superadmin-api/src/") || !file.endsWith(".staging.test.ts") || file.includes("..")))
  throw new Error("Provide staging test files from the API source tree");
const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "apps/superadmin-api/tsconfig.json", "--test", ...files],
  { stdio: "inherit", env: { ...process.env, PPHL_STAGING_DB_TEST: "1" } });
process.exitCode = result.status ?? 1;
