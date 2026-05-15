import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";

class ListQueryDto {
  @IsOptional() @IsUUID() orgId?: string;
  @IsOptional()
  @IsIn(["pending", "resolved_refund", "resolved_no_refund", "void", "all"])
  status?: "pending" | "resolved_refund" | "resolved_no_refund" | "void" | "all";
}

class ResolveBodyDto {
  /**
   * 'refund' issues a refund up to paidCents; 'no_refund' closes the
   * dispute keeping the captain's payment. 'void' is used when the
   * triggering event was reversed (rare, but covered for symmetry).
   */
  @IsIn(["refund", "no_refund", "void"]) decision!:
    | "refund"
    | "no_refund"
    | "void";
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) refundAmountCents?: number;
  @IsString() @MinLength(10) @MaxLength(2000) decisionNotes!: string;
}

/**
 * Backlog #17c — dispute resolution. Pending refund_assessments are
 * created automatically by the drop / transfer / division-rejected
 * flows; today only super_admin can clear them. This controller lets
 * an org_admin work the queue for their org without escalating.
 *
 * Decision logic:
 *   - decision = 'refund'      → status = 'resolved_refund', sets
 *     refundAmountCents (defaults to paid_cents when omitted). The
 *     actual refund row is still created via /finance/refunds; this
 *     is the *adjudication*, not the disbursement.
 *   - decision = 'no_refund'   → status = 'resolved_no_refund', no
 *     refundAmountCents (0).
 *   - decision = 'void'        → status = 'void', no refund.
 *
 * Per CLAUDE.md "no leak" rule, out-of-scope rows return 404.
 */
@ApiTags("org-admin/refund-assessments")
@ApiBearerAuth()
@Controller("org-admin/refund-assessments")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminRefundAssessmentsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // -------------------------------------------------------------------
  // GET /org-admin/refund-assessments
  // -------------------------------------------------------------------
  @Get()
  @ApiOperation({
    summary:
      "List refund assessments scoped to the caller's org(s). Defaults to status=pending."
  })
  async list(
    @Query() q: ListQueryDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const allowedOrgIds = await this.resolveAllowedOrgIds(user.userId, scope);

    if (q.orgId && !allowedOrgIds.includes(q.orgId) && !scope.isSuperAdmin) {
      // Treat out-of-scope orgId as no results (don't leak existence).
      return { items: [] };
    }

    const status = q.status ?? "pending";
    const conditions = [];
    if (q.orgId) {
      conditions.push(eq(schema.refundAssessments.orgId, q.orgId));
    } else if (!scope.isSuperAdmin) {
      conditions.push(inArray(schema.refundAssessments.orgId, allowedOrgIds));
    }
    if (status !== "all") {
      conditions.push(eq(schema.refundAssessments.status, status));
    }

    const rows = await this.db
      .select({
        id: schema.refundAssessments.id,
        orgId: schema.refundAssessments.orgId,
        teamId: schema.refundAssessments.teamId,
        teamName: schema.teams.name,
        seasonId: schema.refundAssessments.seasonId,
        seasonName: schema.seasons.name,
        personId: schema.refundAssessments.personId,
        personFirstName: schema.persons.legalFirstName,
        personLastName: schema.persons.legalLastName,
        invoiceId: schema.refundAssessments.invoiceId,
        sourceEvent: schema.refundAssessments.sourceEvent,
        paidCents: schema.refundAssessments.paidCents,
        currency: schema.refundAssessments.currency,
        status: schema.refundAssessments.status,
        decisionNotes: schema.refundAssessments.decisionNotes,
        refundAmountCents: schema.refundAssessments.refundAmountCents,
        resolvedAt: schema.refundAssessments.resolvedAt,
        createdAt: schema.refundAssessments.createdAt
      })
      .from(schema.refundAssessments)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.refundAssessments.teamId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.refundAssessments.seasonId)
      )
      .innerJoin(
        schema.persons,
        eq(schema.persons.id, schema.refundAssessments.personId)
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.refundAssessments.createdAt))
      .limit(200);

    return {
      items: rows.map((r) => ({
        ...r,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  // -------------------------------------------------------------------
  // POST /org-admin/refund-assessments/:id/resolve
  // -------------------------------------------------------------------
  @Post(":id/resolve")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Resolve a pending refund assessment with a decision + notes. Records refundAmountCents when decision = 'refund'."
  })
  async resolve(
    @Param("id") id: string,
    @Body() body: ResolveBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const [existing] = await this.db
      .select()
      .from(schema.refundAssessments)
      .where(eq(schema.refundAssessments.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException("Refund assessment not found");

    if (!scope.isSuperAdmin) {
      const allowedOrgIds = await this.resolveAllowedOrgIds(
        user.userId,
        scope
      );
      if (!allowedOrgIds.includes(existing.orgId)) {
        throw new NotFoundException("Refund assessment not found");
      }
    }

    if (existing.status !== "pending") {
      throw new ConflictException({
        error: "Already resolved",
        message: `Assessment is already ${existing.status}.`
      });
    }

    let nextStatus: string;
    let refundAmountCents = 0;
    switch (body.decision) {
      case "refund":
        nextStatus = "resolved_refund";
        refundAmountCents = body.refundAmountCents ?? existing.paidCents;
        if (refundAmountCents <= 0) {
          throw new BadRequestException(
            "refundAmountCents must be > 0 for a refund decision"
          );
        }
        if (refundAmountCents > existing.paidCents) {
          throw new BadRequestException(
            "refundAmountCents cannot exceed paidCents on the assessment"
          );
        }
        break;
      case "no_refund":
        nextStatus = "resolved_no_refund";
        break;
      case "void":
        nextStatus = "void";
        break;
    }

    const updatedRows = await this.db
      .update(schema.refundAssessments)
      .set({
        status: nextStatus,
        decisionNotes: body.decisionNotes.trim(),
        refundAmountCents,
        resolvedAt: new Date(),
        resolvedByUserId: user.userId,
        updatedAt: new Date()
      })
      .where(eq(schema.refundAssessments.id, id))
      .returning();
    const updated = updatedRows[0]!;

    return {
      assessment: {
        ...updated,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      }
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Returns the orgIds the caller may resolve refund assessments for.
   * Strict whitelist: must hold super_admin or org_admin at scope=org.
   * Empty array means "nothing to show / nothing to act on".
   */
  private async resolveAllowedOrgIds(
    userId: string,
    scope: UserScopeType
  ): Promise<string[]> {
    if (scope.isSuperAdmin) return [];
    const rows = await this.db
      .select({
        scopeId: schema.userRoleAssignments.scopeId,
        code: schema.roles.code
      })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, userId),
          eq(schema.userRoleAssignments.scopeType, "org"),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    const orgIds = rows
      .filter((r) => ["super_admin", "org_admin"].includes(r.code))
      .map((r) => r.scopeId)
      .filter((x): x is string => !!x);
    if (orgIds.length === 0) {
      throw new ForbiddenException(
        "Requires org_admin (or super_admin) on at least one org"
      );
    }
    return Array.from(new Set(orgIds));
  }
}
