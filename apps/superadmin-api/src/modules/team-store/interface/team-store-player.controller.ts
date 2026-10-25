import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";
import { readStoreProductOptions } from "@sportspulse/kernel";
import { StoreOrdersService } from "../application/store-orders.service";
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
class OrderLineDto {
  @IsUUID() productId!: string;
  @IsInt() quantity!: number;
  @IsOptional() @IsString() @MaxLength(10) size?: string | null;
  @IsOptional() @IsString() @MaxLength(40) personalName?: string | null;
  @IsOptional() @IsInt() personalNumber?: number | null;
}

class PlaceOrderDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => OrderLineDto)
  lines!: OrderLineDto[];
  /** One per checkout; a repeated submit returns the first order. */
  @IsOptional() @IsString() @MaxLength(80) requestKey?: string;
}

@ApiTags("team-store")
@ApiBearerAuth()
@Controller("team-store")
@UseGuards(JwtAuthGuard)
export class TeamStorePlayerController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly orders: StoreOrdersService
  ) {}

  @Get(":teamId/me")
  @ApiOperation({ summary: "What the caller needs to order: their name and number from the roster, and their orders (UC-26)." })
  async me(@CurrentUser() user: AuthPrincipal, @Param("teamId") teamId: string) {
    const me = await this.orders.memberOf(user.userId, teamId);
    return {
      backName: me.backName,
      jerseyNumber: me.jerseyNumber,
      orders: await this.orders.myOrders(user.userId, teamId)
    };
  }

  @Post(":teamId/orders")
  @ApiOperation({ summary: "Place an order (UC-26). Creates the order and its invoice; the player pays it on Payments." })
  async place(@CurrentUser() user: AuthPrincipal, @Param("teamId") teamId: string, @Body() body: PlaceOrderDto) {
    return this.orders.placeOrder(user.userId, teamId, body.lines, body.requestKey ?? null);
  }

  @Post("orders/:orderId/cancel")
  @ApiOperation({ summary: "Cancel your own order while it is placed and unpaid. Voids its invoice and returns the stock." })
  async cancel(@CurrentUser() user: AuthPrincipal, @Param("orderId") orderId: string) {
    return { order: await this.orders.cancelByBuyer(user.userId, orderId) };
  }

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
        // Sizes and name/number personalization (kernel team-store).
        options: readStoreProductOptions(r.metadata),
        createdAt: r.createdAt.toISOString()
      }))
    };
  }
}
