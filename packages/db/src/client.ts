import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Postgres connection string. Use the pooled URL (port 6543) for app runtime, direct (5432) for migrations. */
  url: string;
  /** Max pool size. Default 10. */
  max?: number;
  /** Idle timeout in seconds. Default 20. */
  idleTimeout?: number;
  /** When using Supabase Supavisor pooler (port 6543) in transaction mode, prepared statements must be off. */
  prepare?: boolean;
}

export function createDb(opts: CreateDbOptions) {
  const client = postgres(opts.url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
    prepare: opts.prepare ?? false, // Supavisor transaction-mode requires false
    ssl: "require"
  });
  return drizzle(client, { schema, casing: "snake_case" });
}
