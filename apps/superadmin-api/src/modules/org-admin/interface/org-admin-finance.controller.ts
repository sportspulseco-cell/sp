import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min
} from "class-validator";
import { and, eq, isNull } from "drizzle-orm";
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
import { RecordPaymentHandler } from "../../finance/application/handlers/commands";

type PaymentMethod =
  | "cash"
  | "check"
  | "credit_card"
  | "etransfer"
  | "bank_transfer"
  | "manual";

class RecordPaymentBodyDto {
  @IsInt() @Min(1) amountCents!: number;
  @IsOptional()
  @IsIn(["cash", "check", "credit_card", "etransfer", "bank_transfer", "manual"])
  method?: PaymentMethod;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() externalProviderId?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * Backlog #6 — org-admin manual payment recording. Mirrors the super-admin
 * `POST /finance/invoices/:id/payments` path but scope-checks the invoice's
 * orgId against the caller's org_admin grants.
 *
 * Use cases: a captain hands over a cheque / a parent etransfers offline /
 * a club records cash collected at the rink. The recorded payment is the
 * same path the Stripe webhook follows, so reconciliation + downstream
 * notifications (DUES_COVERED_BY_CAPTAIN etc) all fire as expected.
 */
@ApiTags("org-admin/finance")
@ApiBearerAuth()
@Controller("org-admin/finance")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminFinanceController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly recordPayH: RecordPaymentHandler
  ) {}

  @Post("invoices/:invoiceId/payments")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Record an offline payment against an invoice. Scope-checks the invoice's orgId against the caller's org_admin grants."
  })
  async recordPayment(
    @Param("invoiceId") invoiceId: string,
    @Body() body: RecordPaymentBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const [invoice] = await this.db
      .select({
        id: schema.invoices.id,
        orgId: schema.invoices.orgId,
        currency: schema.invoices.currency
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    if (!invoice) throw new NotFoundException("Invoice not found");

    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(invoice.orgId)) {
        throw new NotFoundException("Invoice not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, invoice.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    const payment = await this.recordPayH.execute({
      invoiceId,
      orgId: invoice.orgId,
      amountCents: body.amountCents,
      currency: invoice.currency,
      method: body.method ?? "manual",
      status: "succeeded",
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
      externalProviderId: body.externalProviderId ?? null,
      notes: body.notes ?? null,
      recordedByUserId: user.userId
    });

    return { payment };
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
