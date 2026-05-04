import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required (direct connection, port 5432).");

  // Use a dedicated single-connection client for migrations.
  const sql = postgres(url, { max: 1, ssl: "require" });
  const db = drizzle(sql);

  console.log("Running migrations from ./migrations …");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("Migrations complete.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
