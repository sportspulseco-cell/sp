import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { STORE_ORDER_STATUSES, type StoreOrderStatus, type StoreProductKind } from "@sportspulse/kernel";
import { StoreOrdersService } from "../application/store-orders.service";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";

class CreateProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() variantLabel?: string;
  @IsOptional() @IsInt() @Min(0) stockQty?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateProductDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() variantLabel?: string;
  @IsOptional() @IsInt() @Min(0) stockQty?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Backlog #11 — team merch catalog. Captain-curated; player-web
 * browses via the public read controller. Mutations require captain
 * scope on the target team (or super_admin bypass).
 *
 * Purchase flow deferred until P4-1 (real Stripe).
 */
class GenerateItemDto {
  @IsIn(["jersey", "hoodie", "cap"]) kind!: StoreProductKind;
  @IsInt() @Min(1) priceCents!: number;
}

class GenerateStoreDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => GenerateItemDto)
  items!: GenerateItemDto[];
  @IsOptional() @IsBoolean() tellPlayers?: boolean;
}

class OrderStatusDto {
  @IsIn(STORE_ORDER_STATUSES as unknown as string[]) status!: StoreOrderStatus;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@ApiTags("captain/store")
@ApiBearerAuth()
@Controller("captain/store")
@UseGuards(JwtAuthGuard)
export class TeamStoreCaptainController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly orders: StoreOrdersService
  ) {}

  @Post(":teamId/generate")
  @ApiOperation({ summary: "UC-25: create the team's jersey, hoodie and cap with name/number personalization at the captain's prices; tell the roster." })
  async generate(@CurrentUser() user: AuthPrincipal, @Param("teamId") teamId: string, @Body() body: GenerateStoreDto) {
    await this.requireCaptain(user.userId, teamId);
    return this.orders.generate(user.userId, teamId, body.items, body.tellPlayers ?? true);
  }

  @Get(":teamId/orders")
  @ApiOperation({ summary: "Orders from the team store, newest first, with payment state from each invoice." })
  async listOrders(@CurrentUser() user: AuthPrincipal, @Param("teamId") teamId: string) {
    await this.requireCaptain(user.userId, teamId);
    return { items: await this.orders.teamOrders(teamId) };
  }

  @Post(":teamId/orders/:orderId/status")
  @ApiOperation({ summary: "Mark an order processing or shipped (paid orders), or cancel it (unpaid). The buyer is told." })
  async setOrderStatus(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Param("orderId") orderId: string,
    @Body() body: OrderStatusDto
  ) {
    await this.requireCaptain(user.userId, teamId);
    // Another team's order does not exist for this captain.
    if ((await this.orders.teamIdOfOrder(orderId)) !== teamId) throw new NotFoundException("Order not found");
    return { order: await this.orders.transition(orderId, body.status, body.note ?? null, user.userId) };
  }

  @Get(":teamId/products")
  @ApiOperation({
    summary:
      "List all products (active + archived) for a team. Captain-scoped."
  })
  async list(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string
  ) {
    await this.requireCaptain(user.userId, teamId);
    const rows = await this.db
      .select()
      .from(schema.teamStoreProducts)
      .where(eq(schema.teamStoreProducts.teamId, teamId))
      .orderBy(desc(schema.teamStoreProducts.createdAt));
    return {
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    };
  }

  @Post(":teamId/products")
  @ApiOperation({ summary: "Create a new product for the team store." })
  async create(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: CreateProductDto
  ) {
    await this.requireCaptain(user.userId, teamId);
    const rows = await this.db
      .insert(schema.teamStoreProducts)
      .values({
        teamId,
        name: body.name.trim(),
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        priceCents: body.priceCents,
        currency: body.currency ?? "USD",
        variantLabel: body.variantLabel ?? null,
        stockQty: body.stockQty ?? null,
        isActive: body.isActive ?? true,
        createdByUserId: user.userId
      })
      .returning();
    const product = rows[0]!;
    return {
      product: {
        ...product,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString()
      }
    };
  }

  @Patch(":teamId/products/:productId")
  @ApiOperation({ summary: "Update a product (price, stock, image, etc)." })
  async update(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Param("productId") productId: string,
    @Body() body: UpdateProductDto
  ) {
    await this.requireCaptain(user.userId, teamId);
    const [existing] = await this.db
      .select()
      .from(schema.teamStoreProducts)
      .where(
        and(
          eq(schema.teamStoreProducts.id, productId),
          eq(schema.teamStoreProducts.teamId, teamId)
        )
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Product not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.description !== undefined)
      patch.description = body.description || null;
    if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl || null;
    if (body.priceCents !== undefined) patch.priceCents = body.priceCents;
    if (body.currency !== undefined) patch.currency = body.currency;
    if (body.variantLabel !== undefined)
      patch.variantLabel = body.variantLabel || null;
    if (body.stockQty !== undefined) patch.stockQty = body.stockQty;
    if (body.isActive !== undefined) patch.isActive = body.isActive;

    const updatedRows = await this.db
      .update(schema.teamStoreProducts)
      .set(patch)
      .where(eq(schema.teamStoreProducts.id, productId))
      .returning();
    const product = updatedRows[0]!;
    return {
      product: {
        ...product,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString()
      }
    };
  }

  @Delete(":teamId/products/:productId")
  @ApiOperation({
    summary:
      "Remove a product. Hard delete since there's no purchase history yet (Stripe deferred)."
  })
  async remove(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Param("productId") productId: string
  ) {
    await this.requireCaptain(user.userId, teamId);
    const deleted = await this.db
      .delete(schema.teamStoreProducts)
      .where(
        and(
          eq(schema.teamStoreProducts.id, productId),
          eq(schema.teamStoreProducts.teamId, teamId)
        )
      )
      .returning({ id: schema.teamStoreProducts.id });
    if (deleted.length === 0) throw new NotFoundException("Product not found");
    return { id: deleted[0]!.id, deleted: true };
  }

  private async requireCaptain(userId: string, teamId: string) {
    const [team] = await this.db
      .select({ id: schema.teams.id, captainUserId: schema.teams.captainUserId })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    const ok = await userIsCaptainOfTeam(
      this.db,
      userId,
      teamId,
      team.captainUserId
    );
    if (!ok) throw new ForbiddenException("Not the captain of this team");
  }
}
