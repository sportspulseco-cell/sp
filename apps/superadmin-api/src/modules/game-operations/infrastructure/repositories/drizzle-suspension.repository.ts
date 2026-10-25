import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Suspension } from "../../domain/entities/suspension.entity";
import { SuspensionId } from "../../domain/identifiers";
import type { SuspensionRepository } from "../../domain/repositories/suspension.repository";

@Injectable()
export class DrizzleSuspensionRepository implements SuspensionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: SuspensionId): Promise<Suspension | null> {
    const [row] = await this.db
      .select()
      .from(schema.suspensions)
      .where(eq(schema.suspensions.id, id.value))
      .limit(1);
    return row ? rowToSuspension(row) : null;
  }
}

/** Map a `suspensions` row to the aggregate (shared with transactional handlers). */
export function rowToSuspension(r: typeof schema.suspensions.$inferSelect): Suspension {
  return Suspension.rehydrate({
    id: r.id,
    personId: r.personId,
    sourceEventId: r.sourceEventId,
    kind: r.kind as never,
    nGames: r.nGames,
    nDays: r.nDays,
    servedCount: r.servedCount,
    status: r.status as never,
    reason: r.reason,
    startAt: r.startAt,
    endAt: r.endAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    issuedByUserId: r.issuedByUserId
  });
}
