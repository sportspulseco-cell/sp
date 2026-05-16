import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { and, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";

class LineupPlayerDto {
  @IsUUID() personId!: string;
  @IsOptional() @IsString() @MaxLength(8) jerseyNumber?: string;
  @IsOptional() @IsString() @MaxLength(10) positionCode?: string;
}

class ScratchEntryDto {
  @IsUUID() personId!: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class PutLineupBodyDto {
  @IsArray() starters!: LineupPlayerDto[];
  @IsArray() bench!: LineupPlayerDto[];
  @IsArray() scratches!: ScratchEntryDto[];
}

/**
 * Captain-managed per-(game, team) lineups. Read is open to anyone
 * with JWT (used by the score-keeping flow + public game pages);
 * write requires the caller to be captain of the team via
 * `userIsCaptainOfTeam`.
 *
 * Locking semantics:
 *   * `locked_at` is stamped when game.status flips to `in_play`
 *     (see games.controller `startPlay` handler).
 *   * Any PUT after locked_at is set → 409 `lineup_locked`.
 *   * Admins fix late mistakes by transitioning the game state
 *     back to `scheduled` (rare; audit-logged).
 */
@ApiTags("game-operations/lineups")
@ApiBearerAuth()
@Controller("games/:gameId/lineups")
@UseGuards(JwtAuthGuard)
export class LineupsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get(":teamId")
  @ApiOperation({
    summary:
      "Fetch the current lineup for (game, team). Returns 404 when no lineup has been submitted yet."
  })
  async getOne(
    @Param("gameId") gameId: string,
    @Param("teamId") teamId: string
  ) {
    const row = await this.findRow(gameId, teamId);
    if (!row) {
      // No lineup yet — return an empty shell so the UI can render
      // the editor without a separate "create vs update" branch.
      return {
        gameId,
        teamId,
        starters: [],
        bench: [],
        scratches: [],
        submittedAt: null,
        lockedAt: null
      };
    }
    return this.toDto(row);
  }

  @Put(":teamId")
  @ApiOperation({
    summary:
      "Upsert the lineup for (game, team). Captain-only. 409 once the game's lineup is locked (game.status = in_play)."
  })
  async upsert(
    @CurrentUser() user: AuthPrincipal,
    @Param("gameId") gameId: string,
    @Param("teamId") teamId: string,
    @Body() body: PutLineupBodyDto
  ) {
    const isCap = await userIsCaptainOfTeam(this.db, user.userId, teamId);
    if (!isCap) {
      throw new NotFoundException("Game or lineup not found");
    }

    // Ensure the team is actually on this game (home or away).
    const [game] = await this.db
      .select({
        id: schema.games.id,
        homeTeamId: schema.games.homeTeamId,
        awayTeamId: schema.games.awayTeamId,
        status: schema.games.status
      })
      .from(schema.games)
      .where(eq(schema.games.id, gameId))
      .limit(1);
    if (!game || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) {
      throw new NotFoundException("Game or lineup not found");
    }

    // Two-stage lock: (1) existing rows are stamped lockedAt when
    // game.startPlay fires, (2) NEW rows created after start were
    // sneaking through because no existing row meant the lockedAt
    // check matched nothing. Gate on game status directly so the
    // PUT path refuses any lineup write once play has begun — even
    // if the captain hadn't submitted yet (BUG-030).
    if (
      game.status !== "scheduled" &&
      game.status !== "postponed"
    ) {
      throw new ConflictException({
        error: "lineup_locked",
        message:
          "This lineup is locked — the game has started or finished. Ask an admin to revert the game to scheduled if a fix is needed.",
        gameStatus: game.status
      });
    }

    const existing = await this.findRow(gameId, teamId);
    if (existing?.lockedAt) {
      throw new ConflictException({
        error: "lineup_locked",
        message:
          "This lineup is locked — the game has started. Ask an admin to revert the game to scheduled if a fix is needed.",
        lockedAt: existing.lockedAt.toISOString()
      });
    }

    const now = new Date();
    const lineupJson = {
      starters: body.starters ?? [],
      bench: body.bench ?? [],
      scratches: body.scratches ?? []
    };

    await this.db
      .insert(schema.gameLineups)
      .values({
        gameId,
        teamId,
        lineup: lineupJson,
        submittedByUserId: user.userId,
        submittedAt: now
      })
      .onConflictDoUpdate({
        target: [schema.gameLineups.gameId, schema.gameLineups.teamId],
        set: {
          lineup: lineupJson,
          submittedByUserId: user.userId,
          submittedAt: now,
          updatedAt: now
        }
      });

    const updated = await this.findRow(gameId, teamId);
    return updated ? this.toDto(updated) : null;
  }

  private async findRow(gameId: string, teamId: string) {
    const [row] = await this.db
      .select()
      .from(schema.gameLineups)
      .where(
        and(
          eq(schema.gameLineups.gameId, gameId),
          eq(schema.gameLineups.teamId, teamId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  private toDto(row: typeof schema.gameLineups.$inferSelect) {
    const lineup = (row.lineup as {
      starters?: unknown[];
      bench?: unknown[];
      scratches?: unknown[];
    }) ?? {};
    return {
      gameId: row.gameId,
      teamId: row.teamId,
      starters: Array.isArray(lineup.starters) ? lineup.starters : [],
      bench: Array.isArray(lineup.bench) ? lineup.bench : [],
      scratches: Array.isArray(lineup.scratches) ? lineup.scratches : [],
      submittedAt: row.submittedAt?.toISOString() ?? null,
      lockedAt: row.lockedAt?.toISOString() ?? null
    };
  }
}

