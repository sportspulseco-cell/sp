import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, inArray } from "drizzle-orm";
import { IsArray, IsUUID } from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";

class ReplaceTierDivisionsBodyDto {
  @IsArray() @IsUUID(undefined, { each: true })
  divisionIds!: string[];
}

interface TierDivisionDto {
  id: string;
  pricingTierId: string;
  divisionId: string;
  createdAt: string;
}

/**
 * N:M assignment between pricing_tiers and divisions. Drives the
 * "Assign divisions to pricing tier" checkbox grid in the Registration
 * setup wizard.
 *
 * The legacy 1:1 pricing_tiers.division_id is left untouched here —
 * callers that still read it get the first checked division as a
 * convenience. The new authority is this join table.
 */
@ApiTags("registration-v2/pricing-tier-divisions")
@ApiBearerAuth()
@Controller("registration-v2/pricing-tier-divisions")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PricingTierDivisionsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get(":tierId")
  @ApiOperation({ summary: "List divisions assigned to a pricing tier" })
  async list(@Param("tierId") tierId: string): Promise<TierDivisionDto[]> {
    const rows = await this.db
      .select()
      .from(schema.pricingTierDivisions)
      .where(eq(schema.pricingTierDivisions.pricingTierId, tierId));
    return rows.map(toDto);
  }

  @Put(":tierId")
  @ApiOperation({
    summary:
      "Replace the full set of division assignments for a tier (idempotent)."
  })
  async replace(
    @Param("tierId") tierId: string,
    @Body() body: ReplaceTierDivisionsBodyDto
  ): Promise<TierDivisionDto[]> {
    const result = await this.db.transaction(async (tx) => {
      // Remove rows the caller dropped.
      if (body.divisionIds.length === 0) {
        await tx
          .delete(schema.pricingTierDivisions)
          .where(eq(schema.pricingTierDivisions.pricingTierId, tierId));
      } else {
        const existing = await tx
          .select({ id: schema.pricingTierDivisions.divisionId })
          .from(schema.pricingTierDivisions)
          .where(eq(schema.pricingTierDivisions.pricingTierId, tierId));
        const existingSet = new Set(existing.map((r) => r.id));
        const desiredSet = new Set(body.divisionIds);

        const toDelete = [...existingSet].filter((d) => !desiredSet.has(d));
        const toInsert = body.divisionIds.filter((d) => !existingSet.has(d));

        if (toDelete.length > 0) {
          await tx
            .delete(schema.pricingTierDivisions)
            .where(
              and(
                eq(schema.pricingTierDivisions.pricingTierId, tierId),
                inArray(schema.pricingTierDivisions.divisionId, toDelete)
              )
            );
        }
        if (toInsert.length > 0) {
          await tx.insert(schema.pricingTierDivisions).values(
            toInsert.map((divisionId) => ({
              pricingTierId: tierId,
              divisionId
            }))
          );
        }
      }

      // Mirror first checked division back into pricing_tiers.division_id
      // for back-compat with callers that still read the legacy 1:1 column.
      const firstDivisionId = body.divisionIds[0] ?? null;
      await tx
        .update(schema.pricingTiers)
        .set({ divisionId: firstDivisionId })
        .where(eq(schema.pricingTiers.id, tierId));

      return tx
        .select()
        .from(schema.pricingTierDivisions)
        .where(eq(schema.pricingTierDivisions.pricingTierId, tierId));
    });

    return result.map(toDto);
  }

  @Get()
  @ApiOperation({
    summary:
      "Bulk-fetch assignments for many tiers in one call. ids=comma-separated list of pricing tier UUIDs."
  })
  async byTiers(
    @Query("ids") idsParam?: string
  ): Promise<Record<string, string[]>> {
    if (!idsParam) return {};
    const tierIds = idsParam.split(",").filter((s) => s.length > 0);
    if (tierIds.length === 0) return {};
    const rows = await this.db
      .select()
      .from(schema.pricingTierDivisions)
      .where(inArray(schema.pricingTierDivisions.pricingTierId, tierIds));
    const result: Record<string, string[]> = {};
    for (const t of tierIds) result[t] = [];
    for (const r of rows) {
      const arr = result[r.pricingTierId] ?? [];
      arr.push(r.divisionId);
      result[r.pricingTierId] = arr;
    }
    return result;
  }

  @Post("backfill")
  @ApiOperation({
    summary:
      "One-shot backfill: copy pricing_tiers.division_id into the join table for tiers missing rows. Safe to call repeatedly."
  })
  async backfill(): Promise<{ inserted: number }> {
    const tiers = await this.db
      .select({
        id: schema.pricingTiers.id,
        divisionId: schema.pricingTiers.divisionId
      })
      .from(schema.pricingTiers);
    const tiersWithDivision = tiers.filter(
      (t): t is { id: string; divisionId: string } =>
        t.divisionId !== null && t.divisionId !== undefined
    );
    if (tiersWithDivision.length === 0) return { inserted: 0 };

    const existing = await this.db
      .select({
        pricingTierId: schema.pricingTierDivisions.pricingTierId,
        divisionId: schema.pricingTierDivisions.divisionId
      })
      .from(schema.pricingTierDivisions)
      .where(
        inArray(
          schema.pricingTierDivisions.pricingTierId,
          tiersWithDivision.map((t) => t.id)
        )
      );
    const existingKeys = new Set(
      existing.map((e) => `${e.pricingTierId}:${e.divisionId}`)
    );

    const toInsert = tiersWithDivision.filter(
      (t) => !existingKeys.has(`${t.id}:${t.divisionId}`)
    );
    if (toInsert.length === 0) return { inserted: 0 };

    await this.db.insert(schema.pricingTierDivisions).values(
      toInsert.map((t) => ({
        pricingTierId: t.id,
        divisionId: t.divisionId
      }))
    );
    return { inserted: toInsert.length };
  }
}

function toDto(
  row: typeof schema.pricingTierDivisions.$inferSelect
): TierDivisionDto {
  return {
    id: row.id,
    pricingTierId: row.pricingTierId,
    divisionId: row.divisionId,
    createdAt: row.createdAt.toISOString()
  };
}
