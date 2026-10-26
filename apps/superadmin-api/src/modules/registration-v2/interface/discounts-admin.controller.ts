import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Put,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf
} from "class-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import {
  discountCodeTextProblem,
  discountRuleProblem,
  familyPricingProblem,
  normalizeDiscountCode,
  type DiscountRule
} from "@sportspulse/kernel";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { seasonVisible } from "../../../shared/auth/visibility";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { loadFamilyPricing } from "../application/discounts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class ListQueryDto {
  @IsUUID() seasonId!: string;
}

class CodeFieldsDto {
  @IsOptional() @IsString() @MaxLength(200) description?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(1_000_000) usageLimit?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DATE_RE) validFrom?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DATE_RE) validTo?: string | null;
  @IsOptional() @IsArray() @IsUUID("all", { each: true }) divisionIds?: string[];
  @IsOptional() @IsArray() @IsUUID("all", { each: true }) pricingTierIds?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateCodeDto extends CodeFieldsDto {
  @IsUUID() seasonId!: string;
  @IsString() @MaxLength(60) code!: string;
  @IsIn(["percent", "fixed"]) kind!: "percent" | "fixed";
  @IsOptional() @IsInt() percentBasisPoints?: number | null;
  @IsOptional() @IsInt() amountCents?: number | null;
}

class UpdateCodeDto extends CodeFieldsDto {
  @IsOptional() @IsIn(["percent", "fixed"]) kind?: "percent" | "fixed";
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() percentBasisPoints?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() amountCents?: number | null;
}

class FamilyPricingDto {
  @IsUUID() seasonId!: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() familyMaxCents?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(["percent", "fixed"]) siblingKind?: "percent" | "fixed" | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() siblingPercentBasisPoints?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() siblingAmountCents?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() siblingFromNth?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

type CodeRow = typeof schema.discountCodes.$inferSelect;

/**
 * Discount codes and family pricing for a season (finance gaps 1 and 2).
 * League and org admins (and super admin) of the season's league or org
 * manage them; scope comes from loadAdminScope via ScopedAdminGuard, so a
 * roster spot never widens it. A season outside the caller's scope is
 * 404. Writes are audited by the global interceptor.
 */
@ApiTags("registration-v2/discounts")
@ApiBearerAuth()
@Controller("registration-v2")
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
@AllowScopedWrite()
export class DiscountsAdminController {
  private readonly log = new Logger(DiscountsAdminController.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get("discount-codes")
  @ApiOperation({ summary: "A season's discount codes with how many times each was used and how much it took off." })
  async list(@Query() q: ListQueryDto, @UserScope() scope: UserScopeType) {
    await this.assertSeason(scope, q.seasonId);
    const rows = await this.db
      .select()
      .from(schema.discountCodes)
      .where(eq(schema.discountCodes.seasonId, q.seasonId))
      .orderBy(desc(schema.discountCodes.createdAt));
    const totals = rows.length
      ? await this.db
          .select({
            codeId: schema.discountCodeRedemptions.discountCodeId,
            uses: sql<number>`count(*) filter (where ${schema.discountCodeRedemptions.status} = 'active')::int`,
            released: sql<number>`count(*) filter (where ${schema.discountCodeRedemptions.status} = 'released')::int`,
            cents: sql<number>`coalesce(sum(${schema.discountCodeRedemptions.amountCents}) filter (where ${schema.discountCodeRedemptions.status} = 'active'), 0)::int`
          })
          .from(schema.discountCodeRedemptions)
          .where(inArray(schema.discountCodeRedemptions.discountCodeId, rows.map((r) => r.id)))
          .groupBy(schema.discountCodeRedemptions.discountCodeId)
      : [];
    return rows.map((r) => {
      const t = totals.find((x) => x.codeId === r.id);
      return { ...toDto(r), activeUses: t?.uses ?? 0, releasedUses: t?.released ?? 0, discountGivenCents: t?.cents ?? 0 };
    });
  }

  @Post("discount-codes")
  @ApiOperation({ summary: "Create a discount code for a season. The code is stored upper case without spaces; one code per season." })
  async create(@Body() body: CreateCodeDto, @UserScope() scope: UserScopeType, @CurrentUser() user: AuthPrincipal) {
    const season = await this.assertSeason(scope, body.seasonId);
    const code = normalizeDiscountCode(body.code);
    const codeProblem = discountCodeTextProblem(code);
    if (codeProblem) throw new UnprocessableEntityException(codeProblem);
    const rule = ruleOf(body.kind, body.percentBasisPoints ?? null, body.amountCents ?? null);
    const ruleProblem = discountRuleProblem(rule);
    if (ruleProblem) throw new UnprocessableEntityException(ruleProblem);
    await this.checkFields(body.seasonId, body);
    const [dup] = await this.db
      .select({ id: schema.discountCodes.id })
      .from(schema.discountCodes)
      .where(and(eq(schema.discountCodes.seasonId, body.seasonId), eq(schema.discountCodes.code, code)))
      .limit(1);
    if (dup) throw new ConflictException({ error: "code_exists", message: `${code} already exists for this season.` });
    const [row] = await this.db
      .insert(schema.discountCodes)
      .values({
        orgId: season.orgId,
        seasonId: body.seasonId,
        code,
        description: body.description?.trim() || null,
        kind: rule.kind,
        percentBasisPoints: rule.kind === "percent" ? rule.percentBasisPoints! : null,
        amountCents: rule.kind === "fixed" ? rule.amountCents! : null,
        usageLimit: body.usageLimit ?? null,
        validFrom: body.validFrom ?? null,
        validTo: body.validTo ?? null,
        divisionIds: [...new Set(body.divisionIds ?? [])],
        pricingTierIds: [...new Set(body.pricingTierIds ?? [])],
        isActive: body.isActive ?? true,
        createdByUserId: user.userId
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException({ error: "code_exists", message: `${code} already exists for this season.` });
    this.log.log(`discount code created ${code} season=${body.seasonId} id=${row.id} by=${user.userId}`);
    return toDto(row);
  }

  @Patch("discount-codes/:id")
  @ApiOperation({ summary: "Edit a discount code. The amount off is fixed once the code has been used; the limit cannot go below the uses taken." })
  async update(@Param("id") id: string, @Body() body: UpdateCodeDto, @UserScope() scope: UserScopeType) {
    const existing = await this.loadCode(scope, id);
    const has = (k: keyof UpdateCodeDto) => Object.prototype.hasOwnProperty.call(body, k);
    const patch: Partial<typeof schema.discountCodes.$inferInsert> = { updatedAt: new Date() };
    if (has("kind") || has("percentBasisPoints") || has("amountCents")) {
      const kind = body.kind ?? (existing.kind as "percent" | "fixed");
      const rule = ruleOf(
        kind,
        has("percentBasisPoints") ? body.percentBasisPoints ?? null : existing.percentBasisPoints,
        has("amountCents") ? body.amountCents ?? null : existing.amountCents
      );
      const changed =
        rule.kind !== existing.kind ||
        (rule.percentBasisPoints ?? null) !== (existing.kind === "percent" ? existing.percentBasisPoints : null) ||
        (rule.amountCents ?? null) !== (existing.kind === "fixed" ? existing.amountCents : null);
      if (changed) {
        const problem = discountRuleProblem(rule);
        if (problem) throw new UnprocessableEntityException(problem);
        if (existing.usageCount > 0) {
          throw new ConflictException({
            error: "code_in_use",
            message: `${existing.code} has been used ${existing.usageCount} time${existing.usageCount === 1 ? "" : "s"}; its amount off cannot change. Turn it off and make a new code.`
          });
        }
        patch.kind = rule.kind;
        patch.percentBasisPoints = rule.kind === "percent" ? rule.percentBasisPoints! : null;
        patch.amountCents = rule.kind === "fixed" ? rule.amountCents! : null;
      }
    }
    await this.checkFields(existing.seasonId, { ...existing, ...body, validFrom: has("validFrom") ? body.validFrom : existing.validFrom, validTo: has("validTo") ? body.validTo : existing.validTo });
    if (has("usageLimit")) {
      const limit = body.usageLimit ?? null;
      if (limit !== null && limit < existing.usageCount) {
        throw new UnprocessableEntityException(`${existing.code} has already been used ${existing.usageCount} times; the limit cannot be lower.`);
      }
      patch.usageLimit = limit;
    }
    if (has("description")) patch.description = body.description?.trim() || null;
    if (has("validFrom")) patch.validFrom = body.validFrom ?? null;
    if (has("validTo")) patch.validTo = body.validTo ?? null;
    if (has("divisionIds")) patch.divisionIds = [...new Set(body.divisionIds ?? [])];
    if (has("pricingTierIds")) patch.pricingTierIds = [...new Set(body.pricingTierIds ?? [])];
    if (has("isActive")) patch.isActive = !!body.isActive;
    // Guarded on the count read above, so a use taken meanwhile cannot slip under a new limit or value.
    const [row] = await this.db
      .update(schema.discountCodes)
      .set(patch)
      .where(and(eq(schema.discountCodes.id, id), eq(schema.discountCodes.usageCount, existing.usageCount)))
      .returning();
    if (!row) throw new ConflictException("The code was just used. Reload and try again.");
    this.log.log(`discount code updated ${row.code} id=${id} fields=${Object.keys(patch).join(",")}`);
    return toDto(row);
  }

  @Get("discount-codes/:id/uses")
  @ApiOperation({ summary: "Who used a discount code: player, registration status, invoice and amount, newest first." })
  async uses(@Param("id") id: string, @UserScope() scope: UserScopeType) {
    const code = await this.loadCode(scope, id);
    const rows = await this.db
      .select({
        id: schema.discountCodeRedemptions.id,
        status: schema.discountCodeRedemptions.status,
        amountCents: schema.discountCodeRedemptions.amountCents,
        createdAt: schema.discountCodeRedemptions.createdAt,
        releasedAt: schema.discountCodeRedemptions.releasedAt,
        releasedReason: schema.discountCodeRedemptions.releasedReason,
        registrationId: schema.discountCodeRedemptions.registrationId,
        registrationStatus: schema.registrations.status,
        invoiceId: schema.discountCodeRedemptions.invoiceId,
        invoiceNumber: schema.invoices.invoiceNumber,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        email: sql<string | null>`${schema.registrations.metadata}->>'email'`
      })
      .from(schema.discountCodeRedemptions)
      .leftJoin(schema.registrations, eq(schema.registrations.id, schema.discountCodeRedemptions.registrationId))
      .leftJoin(schema.invoices, eq(schema.invoices.id, schema.discountCodeRedemptions.invoiceId))
      .leftJoin(schema.persons, eq(schema.persons.id, schema.discountCodeRedemptions.personId))
      .where(eq(schema.discountCodeRedemptions.discountCodeId, code.id))
      .orderBy(desc(schema.discountCodeRedemptions.createdAt));
    return {
      code: toDto(code),
      uses: rows.map((r) => ({
        id: r.id,
        status: r.status,
        amountCents: r.amountCents,
        usedAt: r.createdAt.toISOString(),
        releasedAt: r.releasedAt?.toISOString() ?? null,
        releasedReason: r.releasedReason,
        registrationId: r.registrationId,
        registrationStatus: r.registrationStatus,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        playerName: [r.first, r.last].filter(Boolean).join(" ") || r.email || "Player",
        email: r.email
      }))
    };
  }

  @Get("family-pricing")
  @ApiOperation({ summary: "A season's family maximum and sibling discount (null when none is set)." })
  async getFamily(@Query() q: ListQueryDto, @UserScope() scope: UserScopeType) {
    await this.assertSeason(scope, q.seasonId);
    return { seasonId: q.seasonId, rule: familyDto(await loadFamilyPricing(this.db, q.seasonId)) };
  }

  @Put("family-pricing")
  @ApiOperation({ summary: "Set a season's family maximum and/or sibling discount. Applies to registrations priced from now on; invoices already written keep their price." })
  async putFamily(@Body() body: FamilyPricingDto, @UserScope() scope: UserScopeType, @CurrentUser() user: AuthPrincipal) {
    await this.assertSeason(scope, body.seasonId);
    const siblingKind = body.siblingKind ?? null;
    const sibling = siblingKind ? ruleOf(siblingKind, body.siblingPercentBasisPoints ?? null, body.siblingAmountCents ?? null) : null;
    const rule = { familyMaxCents: body.familyMaxCents ?? null, siblingDiscount: sibling, siblingFromNth: body.siblingFromNth ?? 2 };
    const isActive = body.isActive ?? true;
    if (isActive) {
      const problem = familyPricingProblem(rule);
      if (problem) throw new UnprocessableEntityException(problem);
    }
    const values = {
      seasonId: body.seasonId,
      familyMaxCents: rule.familyMaxCents,
      siblingKind,
      siblingPercentBasisPoints: sibling?.kind === "percent" ? sibling.percentBasisPoints! : null,
      siblingAmountCents: sibling?.kind === "fixed" ? sibling.amountCents! : null,
      siblingFromNth: rule.siblingFromNth,
      isActive,
      updatedByUserId: user.userId,
      updatedAt: new Date()
    };
    const [row] = await this.db
      .insert(schema.seasonFamilyPricing)
      .values(values)
      .onConflictDoUpdate({ target: schema.seasonFamilyPricing.seasonId, set: values })
      .returning();
    this.log.log(
      `family pricing season=${body.seasonId} max=${row!.familyMaxCents} sibling=${row!.siblingKind}:${row!.siblingPercentBasisPoints ?? row!.siblingAmountCents} from=${row!.siblingFromNth} active=${row!.isActive} by=${user.userId}`
    );
    return { seasonId: body.seasonId, rule: familyDto(row!) };
  }

  // ---------- internals ----------

  private async assertSeason(scope: UserScopeType, seasonId: string) {
    const [season] = await this.db
      .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season || !(await seasonVisible(this.db, scope, seasonId))) throw new NotFoundException("Season not found");
    return season;
  }

  private async loadCode(scope: UserScopeType, id: string): Promise<CodeRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException("Discount code not found");
    const [row] = await this.db.select().from(schema.discountCodes).where(eq(schema.discountCodes.id, id)).limit(1);
    if (!row || !(await seasonVisible(this.db, scope, row.seasonId))) throw new NotFoundException("Discount code not found");
    return row;
  }

  /** Dates in order; divisions and prices belong to the code's season. */
  private async checkFields(
    seasonId: string,
    f: { validFrom?: string | null; validTo?: string | null; divisionIds?: string[]; pricingTierIds?: string[] }
  ) {
    if (f.validFrom && f.validTo && f.validFrom > f.validTo) {
      throw new UnprocessableEntityException("The first day must be on or before the last day.");
    }
    const divs = [...new Set(f.divisionIds ?? [])];
    if (divs.length) {
      const found = await this.db
        .select({ id: schema.divisions.id })
        .from(schema.divisions)
        .where(and(inArray(schema.divisions.id, divs), eq(schema.divisions.seasonId, seasonId)));
      if (found.length !== divs.length) throw new UnprocessableEntityException("One of the divisions is not in this season.");
    }
    const tiers = [...new Set(f.pricingTierIds ?? [])];
    if (tiers.length) {
      const found = await this.db
        .select({ id: schema.pricingTiers.id })
        .from(schema.pricingTiers)
        .where(and(inArray(schema.pricingTiers.id, tiers), eq(schema.pricingTiers.seasonId, seasonId)));
      if (found.length !== tiers.length) throw new UnprocessableEntityException("One of the prices is not in this season.");
    }
  }
}

function ruleOf(kind: "percent" | "fixed", percentBasisPoints: number | null, amountCents: number | null): DiscountRule {
  return kind === "percent" ? { kind, percentBasisPoints } : { kind, amountCents };
}

function toDto(r: CodeRow) {
  return {
    id: r.id,
    orgId: r.orgId,
    seasonId: r.seasonId,
    code: r.code,
    description: r.description,
    kind: r.kind as "percent" | "fixed",
    percentBasisPoints: r.percentBasisPoints,
    amountCents: r.amountCents,
    usageLimit: r.usageLimit,
    usageCount: r.usageCount,
    validFrom: r.validFrom,
    validTo: r.validTo,
    divisionIds: r.divisionIds,
    pricingTierIds: r.pricingTierIds,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString()
  };
}

function familyDto(r: typeof schema.seasonFamilyPricing.$inferSelect | null) {
  if (!r) return null;
  return {
    familyMaxCents: r.familyMaxCents,
    siblingKind: r.siblingKind as "percent" | "fixed" | null,
    siblingPercentBasisPoints: r.siblingPercentBasisPoints,
    siblingAmountCents: r.siblingAmountCents,
    siblingFromNth: r.siblingFromNth,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString()
  };
}
