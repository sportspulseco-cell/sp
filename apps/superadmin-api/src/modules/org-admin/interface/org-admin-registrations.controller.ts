import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { and, eq, isNull } from "drizzle-orm";
import {
  assertValidTransition,
  isRegistrationState
} from "@sportspulse/kernel";
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
import { NotificationService } from "../../communications/application/notification.service";

class ReviewBodyDto {
  @IsIn(["approve", "reject"]) action!: "approve" | "reject";
  @IsOptional() @IsString() reason?: string;
}

/**
 * Backlog #6 — org-admin registration review. Mirrors the super-admin
 * approve/reject path (registration-v2 admin-review) but scope-checks
 * the registration's `orgId` against the caller's org_admin grants.
 *
 * Only `approve` and `reject` are exposed here — `request_resubmission`
 * and `override_flag` keep their super-admin gating because they touch
 * compliance flags that org-admins shouldn't unilaterally override.
 */
@ApiTags("org-admin/registrations")
@ApiBearerAuth()
@Controller("org-admin/registrations")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminRegistrationsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Post(":id/review")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Approve or reject a pending registration. Scope-checks the submission's orgId against the caller's org_admin grants."
  })
  async review(
    @Param("id") id: string,
    @Body() body: ReviewBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Registration not found");
    if (!row.orgId) {
      throw new ForbiddenException(
        "Platform-scoped registration — review via super-admin"
      );
    }

    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(row.orgId)) {
        throw new NotFoundException("Registration not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, row.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    if (!isRegistrationState(row.status)) {
      throw new ForbiddenException(
        `Registration is in non-reviewable state ${row.status}`
      );
    }

    const next = body.action === "approve" ? "approved" : "rejected";
    try {
      assertValidTransition(row.status, next);
    } catch (err) {
      // Kernel throws a plain Error for illegal transitions; surface as
      // a clean 422 instead of letting it fall through to 500 (BUG-040).
      throw new UnprocessableEntityException({
        error: "invalid_registration_transition",
        message: (err as Error).message,
        currentStatus: row.status,
        attemptedAction: body.action
      });
    }

    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const recipient = (meta.email as string | undefined) ?? null;
    const personName = (meta.personName as string | undefined) ?? "there";
    const leagueName = (meta.leagueName as string | undefined) ?? "the league";

    await this.db
      .update(schema.registrations)
      .set({
        status: next,
        reviewedAt: new Date(),
        reviewedByUserId: user.userId,
        decisionReason: body.reason?.trim() || null,
        updatedAt: new Date()
      })
      .where(eq(schema.registrations.id, id));

    // Notify via the catalog template — same path the super-admin
    // flow uses, gets the per-org overrides if any are configured.
    void this.notify.queue({
      orgId: row.orgId,
      templateCode: next === "approved"
        ? "registration.approved"
        : "registration.rejected",
      idempotencyKey: `reg-review-${id}-${next}`,
      recipientEmail: recipient,
      payload: {
        personName,
        leagueName,
        reason: body.reason?.trim() ?? ""
      },
      sourceEvent: `registration.${next}`
    });

    return { id, status: next };
  }

  private async userHasOrgAdminOnOrg(
    userId: string,
    orgId: string
  ): Promise<boolean> {
    const rows = await this.db
      .select({ code: schema.roles.code })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, userId),
          eq(schema.userRoleAssignments.scopeType, "org"),
          eq(schema.userRoleAssignments.scopeId, orgId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    return rows.some((r) => ["super_admin", "org_admin"].includes(r.code));
  }
}
