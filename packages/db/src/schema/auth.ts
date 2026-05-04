import { pgSchema, uuid, text, timestamp } from "drizzle-orm/pg-core";

// Reference to Supabase's `auth.users` table. We do NOT manage this — Supabase Auth does.
// Declared here only so other tables can take FK references to auth.users(id).
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
});
