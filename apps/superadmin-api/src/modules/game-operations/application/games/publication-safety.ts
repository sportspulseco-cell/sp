import { sql, type SQL } from "drizzle-orm";
import { ConflictError } from "@sportspulse/kernel";

type Executor = { execute: (query: SQL) => PromiseLike<unknown> };

/** Serialize validation with every INSERT/UPDATE/DELETE on games, including
 * direct scheduler writes. Only held for the short validation/update transaction. */
export async function lockSchedulePublication(tx: Executor): Promise<void> {
  await tx.execute(sql`lock table games in share row exclusive mode`);
}

export async function assertSchedulePublishable(tx: Executor, scope: SQL): Promise<void> {
  const result = await tx.execute(sql`
    select g.id from games g
    where (${scope}) and g.status not in ('cancelled', 'postponed')
      and (
        g.duration_min <= 0 or g.scheduled_start_ts_utc is null
        or g.home_team_id = g.away_team_id
        or exists (
          select 1 from games other
          where other.id <> g.id and other.status not in ('cancelled', 'postponed')
            and other.scheduled_start_ts_utc < g.scheduled_start_ts_utc + make_interval(mins => g.duration_min::int)
            and g.scheduled_start_ts_utc < other.scheduled_start_ts_utc + make_interval(mins => other.duration_min::int)
            and (
              (g.surface_id is not null and other.surface_id = g.surface_id)
              or other.home_team_id in (g.home_team_id, g.away_team_id)
              or other.away_team_id in (g.home_team_id, g.away_team_id)
            )
        )
      ) limit 1
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows;
  if (!rows) throw new Error("Could not verify schedule publication safety");
  if (rows.length) throw new ConflictError("Resolve overlapping team or rink bookings and invalid game times before publishing.");
}
