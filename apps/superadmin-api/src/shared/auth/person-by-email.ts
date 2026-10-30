import { Logger } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

const log = new Logger("PersonByEmail");

/**
 * The person behind an existing account, found by the account's full
 * email (exact match, any case). Creates the persons row when the account
 * has none yet, named from the profile. Returns null when no account uses
 * the email.
 *
 * Exact match only: callers must never list or confirm accounts by part
 * of an email (privacy). Callers check the actor's permission first.
 */
export async function personForAccountEmail(
  db: Database,
  rawEmail: string,
  source: string
): Promise<{ personId: string; created: boolean } | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  const [user] = await db
    .select({ id: schema.authUsers.id })
    .from(schema.authUsers)
    .where(sql`lower(${schema.authUsers.email}) = ${email}`)
    .limit(1);
  if (!user) return null;

  const existing = await personOf(db, user.id);
  if (existing) return { personId: existing, created: false };

  const [profile] = await db
    .select({
      first: schema.profiles.legalFirstName,
      last: schema.profiles.legalLastName,
      display: schema.profiles.displayName
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, user.id))
    .limit(1);
  // Same naming as the account's own first sign-in (iam meScope): the
  // profile's names, else its display name, else the email's local part.
  let first = profile?.first?.trim() || "";
  let last = profile?.last?.trim() || "";
  if (!first) {
    const display = profile?.display?.trim() || email.split("@")[0]!;
    const parts = display.split(/\s+/);
    first = parts[0] || display;
    last = last || parts.slice(1).join(" ");
  }
  const inserted = await db
    .insert(schema.persons)
    .values({
      userId: user.id,
      legalFirstName: first,
      legalLastName: last,
      externalIds: { email, supabaseUserId: user.id, source }
    })
    // persons.user_id is unique: a concurrent create wins, we read it back.
    .onConflictDoNothing({ target: schema.persons.userId })
    .returning({ id: schema.persons.id });
  const personId = inserted[0]?.id ?? (await personOf(db, user.id));
  if (!personId) throw new Error(`persons row for user ${user.id} was not written`);
  log.log(`person ${personId} ${inserted[0] ? "created" : "found after a concurrent create"} for user ${user.id} (${source})`);
  return { personId, created: !!inserted[0] };
}

async function personOf(db: Database, userId: string): Promise<string | null> {
  const [p] = await db
    .select({ id: schema.persons.id })
    .from(schema.persons)
    .where(eq(schema.persons.userId, userId))
    .limit(1);
  return p?.id ?? null;
}
