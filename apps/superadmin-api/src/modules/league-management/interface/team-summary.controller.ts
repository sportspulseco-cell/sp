import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";

/**
 * Lightweight team identifier lookup — id/name/shortName/logoUrl only.
 *
 * Why this exists: the main /league/teams/:id endpoint scopes by
 * league/team and 404s opponents. Players see opponent names in their
 * schedule via the games endpoint, so the name itself is not a scope
 * leak — they just can't fetch it via the rich endpoint. This route
 * lets any authenticated user resolve a team-id → name for surfacing
 * in their own schedule / scoreboard / standings UI (BUG-037).
 *
 * Guarded by JwtAuthGuard only (no scope guard) so a player can resolve
 * the names of teams they play against, regardless of league scope.
 */
@ApiTags("league-management/teams")
@ApiBearerAuth()
@Controller("league/teams")
@UseGuards(JwtAuthGuard)
export class TeamSummaryController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get(":id/summary")
  @ApiOperation({
    summary:
      "Minimal team identifier (id/name/shortName/logoUrl). Auth-only, no scope check — used by role-targeted apps to render opponent names without league-scope (BUG-037)."
  })
  async getSummary(@Param("id") id: string) {
    const [row] = await this.db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        shortName: schema.teams.shortName,
        logoUrl: schema.teams.logoUrl
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Team not found: ${id}`);
    return row;
  }
}
