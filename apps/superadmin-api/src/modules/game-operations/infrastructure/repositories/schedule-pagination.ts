import { sql, type SQL } from "drizzle-orm";
import { schema } from "@sportspulse/db";
import { isUpcomingGame, ValidationError, type ScheduleFilter } from "@sportspulse/kernel";

/** Carry the time boundary across pages so a newly past game cannot skip/repeat rows. */
export function schedulePagination(filter: ScheduleFilter, cursor?: string) {
  let asOf = Date.now();
  let after: { bucket: number; time: number; id: string } | undefined;
  if (cursor) {
    const match = /^schedule:(upcoming|completed|all):(\d+):([01]):(-?\d+)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(cursor);
    if (!match || match[1] !== filter) throw new ValidationError("The schedule page changed. Return to the first page.");
    asOf = Number(match[2]); after = { bucket: Number(match[3]), time: Number(match[4]), id: match[5]! };
    if (!Number.isSafeInteger(asOf) || !Number.isSafeInteger(after.time) || !Number.isFinite(new Date(asOf).getTime()))
      throw new ValidationError("The schedule cursor is invalid. Return to the first page.");
  }
  const g = schema.games;
  const upcoming = sql`(${g.status}='in_play' or (${g.status} not in ('completed','forfeited','cancelled') and ${g.scheduledStartTsUtc}>=${new Date(asOf).toISOString()}::timestamptz))`;
  const stamp = sql`(extract(epoch from date_trunc('milliseconds',${g.scheduledStartTsUtc}))*1000)::bigint`;
  const bucket = filter === "all" ? sql`case when ${upcoming} then 0 else 1 end` : sql`0::integer`;
  const time = filter === "completed" ? sql`-${stamp}` : filter === "all" ? sql`case when ${upcoming} then ${stamp} else -${stamp} end` : stamp;
  const where: SQL[] = [];
  if (filter === "upcoming") where.push(upcoming);
  if (filter === "completed") where.push(sql`${g.status} in ('completed','forfeited')`);
  if (after) where.push(sql`(${bucket},${time},${g.id})>(${after.bucket},${after.time}::bigint,${after.id}::uuid)`);
  return {
    where, order: [sql`${bucket} asc`, sql`${time} asc`, sql`${g.id} asc`],
    cursorFor(row: { id: string; status: string; scheduledStartTsUtc: Date }) {
      const future = isUpcomingGame(row, asOf);
      const b = filter === "all" && !future ? 1 : 0;
      const t = (filter === "completed" || (filter === "all" && !future) ? -1 : 1) * row.scheduledStartTsUtc.getTime();
      return `schedule:${filter}:${asOf}:${b}:${t}|${row.id}`;
    },
  };
}
