import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

class SubscribeBodyDto {
  @IsString() @MinLength(10) endpoint!: string;
  @IsOptional() @IsString() p256dhKey?: string;
  @IsOptional() @IsString() authKey?: string;
  @IsOptional() @IsString() userAgent?: string;
  @IsOptional() @IsIn(["web", "ios", "android"]) platform?:
    | "web"
    | "ios"
    | "android";
}

/**
 * Backlog #16 — push subscription registry. Each client (browser via
 * service-worker, or native mobile via FCM/APNs) POSTs its endpoint
 * + keys here. Re-POSTing the same endpoint refreshes `last_seen_at`
 * and re-activates the row. Endpoint is the unique key.
 */
@ApiTags("communications/push")
@ApiBearerAuth()
@Controller("communications/push")
@UseGuards(JwtAuthGuard)
export class PushSubscriptionsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Post("subscribe")
  @ApiOperation({
    summary:
      "Register or refresh the caller's push subscription. Idempotent on endpoint."
  })
  async subscribe(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: SubscribeBodyDto
  ) {
    const platform = body.platform ?? "web";
    const [existing] = await this.db
      .select({ id: schema.pushSubscriptions.id })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, body.endpoint))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.pushSubscriptions)
        .set({
          userId: user.userId,
          platform,
          p256dhKey: body.p256dhKey ?? null,
          authKey: body.authKey ?? null,
          userAgent: body.userAgent ?? null,
          lastSeenAt: new Date(),
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(schema.pushSubscriptions.id, existing.id))
        .returning();
      return { subscription: serialise(updated!) };
    }

    const [created] = await this.db
      .insert(schema.pushSubscriptions)
      .values({
        userId: user.userId,
        platform,
        endpoint: body.endpoint,
        p256dhKey: body.p256dhKey ?? null,
        authKey: body.authKey ?? null,
        userAgent: body.userAgent ?? null
      })
      .returning();
    return { subscription: serialise(created!) };
  }

  @Get()
  @ApiOperation({ summary: "List the caller's active push subscriptions." })
  async list(@CurrentUser() user: AuthPrincipal) {
    const rows = await this.db
      .select()
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, user.userId),
          eq(schema.pushSubscriptions.isActive, true)
        )
      )
      .orderBy(desc(schema.pushSubscriptions.lastSeenAt));
    return { items: rows.map(serialise) };
  }

  @Delete(":id")
  @ApiOperation({
    summary:
      "Remove one of the caller's push subscriptions (e.g. signing out of a device)."
  })
  async remove(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    const deleted = await this.db
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.id, id),
          eq(schema.pushSubscriptions.userId, user.userId)
        )
      )
      .returning({ id: schema.pushSubscriptions.id });
    return { id: deleted[0]?.id ?? null, deleted: deleted.length > 0 };
  }
}

function serialise(r: typeof schema.pushSubscriptions.$inferSelect) {
  return {
    id: r.id,
    platform: r.platform,
    endpoint: r.endpoint,
    userAgent: r.userAgent,
    isActive: r.isActive,
    lastSeenAt: r.lastSeenAt.toISOString(),
    createdAt: r.createdAt.toISOString()
  };
}
