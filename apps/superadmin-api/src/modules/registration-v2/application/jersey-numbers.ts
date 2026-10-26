import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { assignJerseyNumber } from "@sportspulse/kernel";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * One team's roster for one season is changed by one transaction at a
 * time. Every roster add and captain spot takes this lock before it
 * reads the numbers in use, so two approvals at once never pick the
 * same number. The row lock on active memberships alone cannot do this
 * for an empty roster: there is no row to lock.
 */
export async function lockTeamRoster(tx: Tx, teamId: string, seasonId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`roster:${teamId}:${seasonId}`}, 0))`);
}

/** Numbers worn on the team this season (the unique index's rows). */
export async function jerseyNumbersInUse(tx: Tx, teamId: string, seasonId: string): Promise<number[]> {
  const rows = await tx
    .select({ n: schema.teamMemberships.jerseyNumber })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.teamId, teamId),
        eq(schema.teamMemberships.seasonId, seasonId),
        isNull(schema.teamMemberships.effectiveTo),
        isNotNull(schema.teamMemberships.jerseyNumber)
      )
    );
  return rows.map((r) => r.n as number);
}

/**
 * The number for a player joining the roster (FR-3.4.2), under the team
 * lock: the requested one when free, else the lowest free from 1 to 99.
 * Call inside the transaction that writes the membership.
 */
export async function pickJerseyNumber(
  tx: Tx,
  teamId: string,
  seasonId: string,
  requested: number | null
): Promise<number | null> {
  await lockTeamRoster(tx, teamId, seasonId);
  return assignJerseyNumber(requested, await jerseyNumbersInUse(tx, teamId, seasonId));
}
