import { Inject, Injectable } from "@nestjs/common";
import { type CommandHandler } from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { projectGameStats } from "../projections";

export interface ProjectStatsInput {
  gameId: string;
  /** When true, allow projecting before finalization (e.g. live preview) */
  allowInProgress?: boolean;
}

export interface ProjectStatsOutput {
  gameId: string;
  linesWritten: number;
  sportCode: string;
}

// Read all events for a game, fold via the sport's reducer, rewrite the
// game's StatLines in one transaction. Idempotent. Finalize runs the same
// projection itself (SCH-17); this is the manual "Project stats" button.
@Injectable()
export class ProjectStatsHandler
  implements CommandHandler<ProjectStatsInput, ProjectStatsOutput>
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async execute(input: ProjectStatsInput): Promise<ProjectStatsOutput> {
    const r = await this.db.transaction((tx) =>
      projectGameStats(tx, input.gameId, { allowInProgress: input.allowInProgress })
    );
    return { gameId: r.gameId, linesWritten: r.linesWritten, sportCode: r.sportCode };
  }
}
