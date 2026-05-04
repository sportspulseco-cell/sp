import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  AssignOfficialInput,
  GameOfficialRepository,
  GameOfficialRole,
  GameOfficialRow,
  GameOfficialStatus,
  UpdateOfficialStatusInput
} from "../../domain/repositories/game-official.repository";

@Injectable()
export class DrizzleGameOfficialRepository implements GameOfficialRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listForGame(gameId: string): Promise<GameOfficialRow[]> {
    const rows = await this.db
      .select()
      .from(schema.gameOfficials)
      .where(
        and(
          eq(schema.gameOfficials.gameId, gameId),
          isNull(schema.gameOfficials.revokedAt)
        )
      )
      .orderBy(desc(schema.gameOfficials.createdAt));
    return rows.map((r) => this.toRow(r));
  }

  async listForPerson(personId: string): Promise<GameOfficialRow[]> {
    const rows = await this.db
      .select()
      .from(schema.gameOfficials)
      .where(eq(schema.gameOfficials.personId, personId))
      .orderBy(desc(schema.gameOfficials.createdAt));
    return rows.map((r) => this.toRow(r));
  }

  async findById(id: string): Promise<GameOfficialRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.gameOfficials)
      .where(eq(schema.gameOfficials.id, id));
    return row ? this.toRow(row) : null;
  }

  async assign(input: AssignOfficialInput): Promise<GameOfficialRow> {
    // Idempotency: if an active row exists for (game, role, slot, person), return it.
    const cs = [
      eq(schema.gameOfficials.gameId, input.gameId),
      eq(schema.gameOfficials.personId, input.personId),
      eq(schema.gameOfficials.role, input.role),
      isNull(schema.gameOfficials.revokedAt)
    ];
    if (input.slot)
      cs.push(eq(schema.gameOfficials.slot, input.slot));
    else cs.push(isNull(schema.gameOfficials.slot));

    const [existing] = await this.db
      .select()
      .from(schema.gameOfficials)
      .where(and(...cs));
    if (existing) return this.toRow(existing);

    const [row] = await this.db
      .insert(schema.gameOfficials)
      .values({
        gameId: input.gameId,
        personId: input.personId,
        role: input.role,
        slot: input.slot ?? null,
        status: input.status ?? "confirmed",
        assignedByUserId: input.assignedByUserId ?? null,
        notes: input.notes ?? null
      })
      .returning();
    return this.toRow(row!);
  }

  async updateStatus(
    input: UpdateOfficialStatusInput
  ): Promise<GameOfficialRow> {
    await this.db
      .update(schema.gameOfficials)
      .set({ status: input.status, updatedAt: sql`NOW()` })
      .where(eq(schema.gameOfficials.id, input.id));
    const found = await this.findById(input.id);
    if (!found) throw new Error("game_official not found");
    return found;
  }

  async revoke(id: string): Promise<GameOfficialRow> {
    await this.db
      .update(schema.gameOfficials)
      .set({ revokedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(schema.gameOfficials.id, id));
    const found = await this.findById(id);
    if (!found) throw new Error("game_official not found");
    return found;
  }

  private toRow(
    r: typeof schema.gameOfficials.$inferSelect
  ): GameOfficialRow {
    return {
      id: r.id,
      gameId: r.gameId,
      personId: r.personId,
      role: r.role as GameOfficialRole,
      slot: r.slot,
      status: r.status as GameOfficialStatus,
      assignedByUserId: r.assignedByUserId,
      notes: r.notes,
      revokedAt: r.revokedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
}
