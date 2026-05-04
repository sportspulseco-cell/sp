import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required (direct connection, port 5432, not the pooler)."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
  schemaFilter: ["public"],
  // Don't drift on tables Supabase manages itself
  tablesFilter: ["!auth.*", "!storage.*", "!realtime.*", "!supabase_*", "!pg_*"]
});
