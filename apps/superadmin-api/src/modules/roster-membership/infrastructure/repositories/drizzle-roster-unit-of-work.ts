import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@sportspulse/db";
import { sql } from "drizzle-orm";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type { RosterUnitOfWork, RosterWorkRepositories } from "../../application/moves/roster-unit-of-work";
import { DrizzleRosterMoveRepository } from "./drizzle-roster-move.repository";
import { DrizzleTeamMembershipRepository } from "./drizzle-team-membership.repository";

@Injectable()
export class DrizzleRosterUnitOfWork implements RosterUnitOfWork {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  run<T>(subject: { personId: string; seasonId: string }, work: (repositories: RosterWorkRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      // Serialize moves for the same player/season, including both halves of a trade.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`roster-move:${subject.personId}:${subject.seasonId}`}))`);
      const connection = tx as unknown as Database;
      return work({ moves: new DrizzleRosterMoveRepository(connection), memberships: new DrizzleTeamMembershipRepository(connection) });
    });
  }
}
