import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";

/**
 * Backlog #11 — read-only player surface for the team merch catalog.
 * Active products only; captain manages via `/captain/store/...`.
 *
 * Access is granted to: the team's captain, super_admin, or any user
 * with an active `team_memberships` row on the team. Other callers
 * get 404 so we don't leak existence of arbitrary team stores.
 */
@ApiTags("team-store")
@ApiBearerAuth()
@Controller("team-store")
@UseGuards(JwtAuthGuard)
export class TeamStorePlayerController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get(":teamId/products")
  @ApiOperation({
    summary:
      "List active products for a team. Access requires team membership, captaincy, or super_admin."
  })
  async list(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string
  ) {
    const [team] = await this.db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        captainUserId: schema.teams.captainUserId
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const captain = await userIsCaptainOfTeam(
      this.db,
      user.userId,
      teamId,
      team.captainUserId
    );

    if (!captain) {
      // Must hold an active membership row on this team.
      const [person] = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(eq(schema.persons.userId, user.userId))
        .limit(1);
      if (!person) throw new NotFoundException("Team not found");
      const [membership] = await this.db
        .select({ id: schema.teamMemberships.id })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, teamId),
            eq(schema.teamMemberships.personId, person.id),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        )
        .limit(1);
      if (!membership) throw new ForbiddenException("Not a member of this team");
    }

    const rows = await this.db
      .select()
      .from(schema.teamStoreProducts)
      .where(
        and(
          eq(schema.teamStoreProducts.teamId, teamId),
          eq(schema.teamStoreProducts.isActive, true)
        )
      )
      .orderBy(desc(schema.teamStoreProducts.createdAt));

    return {
      team: { id: team.id, name: team.name },
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        imageUrl: r.imageUrl,
        priceCents: r.priceCents,
        currency: r.currency,
        variantLabel: r.variantLabel,
        stockQty: r.stockQty,
        createdAt: r.createdAt.toISOString()
      }))
    };
  }
}
