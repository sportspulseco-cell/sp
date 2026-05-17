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
  Put,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { RegistrationV2Service } from "../../registration-v2/application/registration-v2.service";
import {
  CreateFormVersionHandler,
  PublishFormVersionHandler,
  UpdateFormHandler
} from "../../registration-compliance/application/registration-forms/handlers";
import {
  UpdateFormBodyDto,
  CreateFormVersionBodyDto
} from "../../registration-compliance/interface/dto/registration.dto";
import {
  CreatePricingTierBodyDto,
  UpdatePricingTierBodyDto
} from "../../registration-v2/interface/dto/pricing-tier.dto";
import {
  CreateEmailTemplateBodyDto,
  UpdateEmailTemplateBodyDto
} from "../../registration-v2/interface/dto/email-template.dto";
import { IsArray, IsUUID } from "class-validator";

class ReplaceTierDivisionsBodyDto {
  @IsArray() @IsUUID(undefined, { each: true })
  divisionIds!: string[];
}

/**
 * BUG-043 close — org-admin proxy for the form-builder mutations.
 *
 * Each method: look up the resource → derive its orgId → verify the
 * caller has super_admin OR active org_admin on that orgId → delegate
 * to the same handler/service the super-admin controller uses. No
 * business logic is duplicated; only the gate moves.
 *
 * Pairs with org-admin-web's path-rewriting apiFetch wrapper that
 * routes /registration/forms/... and /registration-v2/... SDK calls
 * to the /org-admin/* paths below.
 */
@ApiTags("org-admin/form-builder")
@ApiBearerAuth()
@Controller("org-admin")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminFormBuilderController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly regV2: RegistrationV2Service,
    private readonly updateFormH: UpdateFormHandler,
    private readonly createVersionH: CreateFormVersionHandler,
    private readonly publishVersionH: PublishFormVersionHandler
  ) {}

  // ----- forms -----

  @Get("forms/:id")
  @ApiOperation({ summary: "Read a form (org-admin scoped)." })
  async getForm(@Param("id") id: string, @CurrentUser() user: AuthPrincipal) {
    const form = await this.loadForm(id);
    await this.assertScope(user, form.orgId);
    return form;
  }

  @Patch("forms/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Update form metadata (org-admin scoped)." })
  async updateForm(
    @Param("id") id: string,
    @Body() body: UpdateFormBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const form = await this.loadForm(id);
    await this.assertScope(user, form.orgId);
    return this.updateFormH.execute({ id, ...body });
  }

  @Get("forms/:id/versions")
  @ApiOperation({ summary: "List form versions (org-admin scoped)." })
  async listFormVersions(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    const form = await this.loadForm(id);
    await this.assertScope(user, form.orgId);
    const rows = await this.db
      .select()
      .from(schema.registrationFormVersions)
      .where(eq(schema.registrationFormVersions.formId, id));
    return rows;
  }

  @Post("forms/:id/versions")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Create a draft form version (org-admin scoped)." })
  async createFormVersion(
    @Param("id") id: string,
    @Body() body: CreateFormVersionBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const form = await this.loadForm(id);
    await this.assertScope(user, form.orgId);
    return this.createVersionH.execute({ formId: id, schema: body.schema });
  }

  @Post("forms/:id/versions/:versionId/publish")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Publish a form version (org-admin scoped)." })
  async publishFormVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    const form = await this.loadForm(id);
    await this.assertScope(user, form.orgId);
    return this.publishVersionH.execute({ formId: id, versionId });
  }

  // ----- pricing tiers -----

  @Get("pricing-tiers")
  @ApiOperation({ summary: "List pricing tiers for a season (org-admin scoped)." })
  async listPricingTiers(
    @Query("seasonId") seasonId: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    if (!seasonId) return [];
    const season = await this.loadSeason(seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.listPricingTiers({ seasonId });
  }

  @Post("pricing-tiers")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Create a pricing tier (org-admin scoped)." })
  async createPricingTier(
    @Body() body: CreatePricingTierBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const season = await this.loadSeason(body.seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.createPricingTier(body);
  }

  @Patch("pricing-tiers/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Update a pricing tier (org-admin scoped)." })
  async updatePricingTier(
    @Param("id") id: string,
    @Body() body: UpdatePricingTierBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const tier = await this.regV2.getPricingTier(id);
    const season = await this.loadSeason(tier.seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.updatePricingTier(id, body);
  }

  @Delete("pricing-tiers/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Delete a pricing tier (org-admin scoped)." })
  async deletePricingTier(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    const tier = await this.regV2.getPricingTier(id);
    const season = await this.loadSeason(tier.seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.deletePricingTier(id);
  }

  // ----- email templates -----

  @Get("email-templates")
  @ApiOperation({ summary: "List email templates for a season (org-admin scoped)." })
  async listEmailTemplates(
    @Query("seasonId") seasonId: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    if (!seasonId) return [];
    const season = await this.loadSeason(seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.listEmailTemplates({ seasonId });
  }

  @Post("email-templates")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Create an email template (org-admin scoped)." })
  async createEmailTemplate(
    @Body() body: CreateEmailTemplateBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const season = await this.loadSeason(body.seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.createEmailTemplate(body);
  }

  @Patch("email-templates/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Update an email template (org-admin scoped)." })
  async updateEmailTemplate(
    @Param("id") id: string,
    @Body() body: UpdateEmailTemplateBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const tpl = await this.regV2.getEmailTemplate(id);
    const season = await this.loadSeason(tpl.seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.updateEmailTemplate(id, body);
  }

  @Delete("email-templates/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Delete an email template (org-admin scoped)." })
  async deleteEmailTemplate(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    const tpl = await this.regV2.getEmailTemplate(id);
    const season = await this.loadSeason(tpl.seasonId);
    await this.assertScope(user, season.orgId);
    return this.regV2.deleteEmailTemplate(id);
  }

  // ----- pricing-tier division assignments -----

  @Get("pricing-tier-divisions")
  @ApiOperation({
    summary:
      "Bulk-fetch tier→divisions for many tiers (org-admin scoped). ids=comma-separated UUIDs."
  })
  async tierDivisionsByTiers(
    @Query("ids") idsParam: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<Record<string, string[]>> {
    if (!idsParam) return {};
    const tierIds = idsParam.split(",").filter((s) => s.length > 0);
    if (tierIds.length === 0) return {};
    // Scope check: every tier's season's org must match the caller's org.
    const tiers = await this.db
      .select({ id: schema.pricingTiers.id, seasonId: schema.pricingTiers.seasonId })
      .from(schema.pricingTiers)
      .where(inArray(schema.pricingTiers.id, tierIds));
    const seasonIds = [...new Set(tiers.map((t) => t.seasonId))];
    if (seasonIds.length > 0) {
      const seasons = await this.db
        .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
        .from(schema.seasons)
        .where(inArray(schema.seasons.id, seasonIds));
      for (const s of seasons) await this.assertScope(user, s.orgId);
    }
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

  @Put("pricing-tier-divisions/:tierId")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Replace tier→divisions (org-admin scoped)." })
  async replaceTierDivisions(
    @Param("tierId") tierId: string,
    @Body() body: ReplaceTierDivisionsBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const tier = await this.regV2.getPricingTier(tierId);
    const season = await this.loadSeason(tier.seasonId);
    await this.assertScope(user, season.orgId);
    // Inline same logic as PricingTierDivisionsController.replace.
    return this.db.transaction(async (tx) => {
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
      await tx
        .update(schema.pricingTiers)
        .set({ divisionId: body.divisionIds[0] ?? null })
        .where(eq(schema.pricingTiers.id, tierId));
      return tx
        .select()
        .from(schema.pricingTierDivisions)
        .where(eq(schema.pricingTierDivisions.pricingTierId, tierId));
    });
  }

  // ----- helpers -----

  private async loadForm(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.registrationForms)
      .where(eq(schema.registrationForms.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Form ${id} not found`);
    return row;
  }

  private async loadSeason(id: string) {
    const [row] = await this.db
      .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Season ${id} not found`);
    return row;
  }

  /**
   * Verify the caller is super_admin or holds an active org_admin
   * grant on the resource's orgId. 404 (not 403) on scope mismatch
   * so we don't leak existence (ARCH §3.4).
   */
  private async assertScope(user: AuthPrincipal, orgId: string): Promise<void> {
    const rows = await this.db
      .select({ code: schema.roles.code, scopeId: schema.userRoleAssignments.scopeId })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, user.userId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    const ok = rows.some(
      (r) =>
        r.code === "super_admin" ||
        (r.code === "org_admin" && r.scopeId === orgId)
    );
    if (!ok) {
      // Use NotFoundException to match the no-leak read pattern; for
      // writes, we could also use ForbiddenException — but consistency
      // matters more here.
      throw new NotFoundException("Resource not found");
    }
  }
}
