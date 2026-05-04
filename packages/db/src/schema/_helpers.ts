import { customType } from "drizzle-orm/pg-core";

// citext — case-insensitive text. Requires `CREATE EXTENSION citext` (handled by 0000_init.sql).
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  }
});

// inet — IP address type for audit logs.
export const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return "inet";
  }
});
