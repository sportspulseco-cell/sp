import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
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
import { InvoicingService } from "../../finance/application/services/invoicing.service";
import { BulkCreateInvoiceBodyDto } from "../../finance/interface/dto/bulk-invoice.dto";

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
    private readonly recordPayH: RecordPaymentHandler,
    private readonly invoicing: InvoicingService
  ) {}

  @Post("invoices/bulk")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Create invoices for one or more people inside the caller's org. Delegates to the same InvoicingService the sa-only endpoint uses; the extra guard here is the org-scope check that prevents an org_admin from billing across orgs (404 on mismatch — no existence leak)."
  })
  async createBulkInvoice(
    @Headers("x-idempotency-key") idemKey: string,
    @Body() body: BulkCreateInvoiceBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(body.orgId)) {
        throw new NotFoundException("Org not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, body.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }
    // For non-individual scopes, the targetId (team / division / league
    // / season) must itself belong to the caller's org. Block cross-org
    // fan-out before the service walks the memberships.
    await this.assertTargetInOrg(body.billingScope, body.targetId, body.orgId);
    return this.invoicing.createBulkInvoice(idemKey, body);
  }

  private async assertTargetInOrg(
    scope: string,
    targetId: string,
    orgId: string
  ): Promise<void> {
    if (scope === "individual" || scope === "org") return;
    if (scope === "team") {
      const [row] = await this.db
        .select({ orgId: schema.teams.orgId })
        .from(schema.teams)
        .where(eq(schema.teams.id, targetId))
        .limit(1);
      if (!row || row.orgId !== orgId)
        throw new NotFoundException("Target not found in org");
      return;
    }
    if (scope === "league") {
      const [row] = await this.db
        .select({ orgId: schema.leagues.orgId })
        .from(schema.leagues)
        .where(eq(schema.leagues.id, targetId))
        .limit(1);
      if (!row || row.orgId !== orgId)
        throw new NotFoundException("Target not found in org");
      return;
    }
    if (scope === "season") {
      const [row] = await this.db
        .select({ orgId: schema.seasons.orgId })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, targetId))
        .limit(1);
      if (!row || row.orgId !== orgId)
        throw new NotFoundException("Target not found in org");
      return;
    }
    if (scope === "division") {
      const [row] = await this.db
        .select({ orgId: schema.seasons.orgId })
        .from(schema.divisions)
        .innerJoin(
          schema.seasons,
          eq(schema.seasons.id, schema.divisions.seasonId)
        )
        .where(eq(schema.divisions.id, targetId))
        .limit(1);
      if (!row || row.orgId !== orgId)
        throw new NotFoundException("Target not found in org");
      return;
    }
    throw new BadRequestException(`Unknown billingScope: ${scope}`);
  }

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
