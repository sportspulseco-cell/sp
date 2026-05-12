import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { and, desc, eq, gt, ilike, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

// =====================================================================
// DTOs
// =====================================================================

class InvoiceItemDto {
  @IsString() @MinLength(1) description!: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsInt() @Min(1) unitAmountCents!: number;
  @IsString()
  @IsIn([
    "registration_fee",
    "jersey",
    "equipment",
    "late_fee",
    "discount",
    "other"
  ])
  kind!: string;
}

class CreateInvoiceBodyDto {
  @IsUUID() orgId!: string;
  @IsString()
  @IsIn(["individual", "team", "division", "league", "season", "org"])
  billingScope!: string;
  @IsUUID() targetId!: string;
  @IsOptional()
  @IsString()
  @IsIn(["manual", "registration", "team_dues", "sub_invoice", "referee_payroll"])
  invoiceType?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
  @IsDateString() dueAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() feeScheduleId?: string;
  @IsOptional() paymentPlanEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) depositCents?: number;
  @IsOptional() @IsInt() @Min(1) @Max(12) installmentCount?: number;
  @IsOptional() @IsDateString() installmentStartDate?: string;
}

class ApplyWalletCreditBodyDto {
  @IsInt() @Min(1) walletCents!: number;
}

class RefundBodyDto {
  @IsString() @IsIn(["gateway", "wallet"]) refundType!: "gateway" | "wallet";
  @IsInt() @Min(1) amountCents!: number;
  @IsString() @MinLength(10) reason!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

class PatchInvoiceBodyDto {
  @IsDateString() dueAt!: string;
}

class TeamSplitItemDto {
  @IsUUID() personId!: string;
  @IsInt() @Min(0) amountCents!: number;
}

class TeamSplitBodyDto {
  @IsString() @IsIn(["even", "custom"]) method!: "even" | "custom";
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamSplitItemDto)
  customAmounts?: TeamSplitItemDto[];
  @IsDateString() dueAt!: string;
  @IsOptional() includeCaption?: boolean;
}

// =====================================================================
// Controller
// =====================================================================

@ApiTags("finance/invoicing")
@ApiBearerAuth()
@Controller("finance")
export class FinanceInvoicingController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // -------------------------------------------------------------------
  // GET /finance/dashboard-summary?orgId=…
  // -------------------------------------------------------------------
  @Get("dashboard-summary")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "AR dashboard metric cards. Single aggregation query: total invoiced, collected, outstanding, overdue, counts. Omit orgId for platform-wide totals."
  })
  async dashboardSummary(@Query("orgId") orgId?: string) {
    const [row] = await this.db.execute<{
      total_invoiced_cents: number | null;
      collected_cents: number | null;
      outstanding_cents: number | null;
      overdue_cents: number | null;
      invoice_count: number;
      overdue_count: number;
    }>(
      orgId
        ? sql`
            SELECT
              COALESCE(SUM(total_cents) FILTER (WHERE status != 'void'), 0)::int
                AS total_invoiced_cents,
              COALESCE(SUM(paid_cents) FILTER (WHERE status != 'void'), 0)::int
                AS collected_cents,
              COALESCE(SUM(total_cents - paid_cents)
                FILTER (WHERE status IN ('sent','partial','overdue')), 0)::int
                AS outstanding_cents,
              COALESCE(SUM(total_cents - paid_cents)
                FILTER (WHERE status = 'overdue'), 0)::int
                AS overdue_cents,
              COUNT(*) FILTER (WHERE status != 'void')::int AS invoice_count,
              COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_count
            FROM invoices
            WHERE org_id = ${orgId}
          `
        : sql`
            SELECT
              COALESCE(SUM(total_cents) FILTER (WHERE status != 'void'), 0)::int
                AS total_invoiced_cents,
              COALESCE(SUM(paid_cents) FILTER (WHERE status != 'void'), 0)::int
                AS collected_cents,
              COALESCE(SUM(total_cents - paid_cents)
                FILTER (WHERE status IN ('sent','partial','overdue')), 0)::int
                AS outstanding_cents,
              COALESCE(SUM(total_cents - paid_cents)
                FILTER (WHERE status = 'overdue'), 0)::int
                AS overdue_cents,
              COUNT(*) FILTER (WHERE status != 'void')::int AS invoice_count,
              COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_count
            FROM invoices
          `
    );
    return {
      totalInvoicedCents: row?.total_invoiced_cents ?? 0,
      collectedCents: row?.collected_cents ?? 0,
      outstandingCents: row?.outstanding_cents ?? 0,
      overdueCents: row?.overdue_cents ?? 0,
      invoiceCount: row?.invoice_count ?? 0,
      overdueCount: row?.overdue_count ?? 0
    };
  }

  // -------------------------------------------------------------------
  // GET /finance/invoices?orgId&status&billingScope&search&page&limit
  // -------------------------------------------------------------------
  @Get("invoices/list")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "Paginated invoices list with computed outstandingCents + recipient name join."
  })
  async listInvoices(
    @Query("orgId") orgId?: string,
    @Query("status") status?: string,
    @Query("billingScope") billingScope?: string,
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "50"
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const conds = [];
    if (orgId) conds.push(eq(schema.invoices.orgId, orgId));
    if (status) conds.push(eq(schema.invoices.status, status));
    if (billingScope) conds.push(eq(schema.invoices.billingScope, billingScope));
    if (search) {
      const like = `%${search}%`;
      conds.push(
        or(
          ilike(schema.invoices.invoiceNumber, like),
          ilike(schema.invoices.recipientEmail, like)
        )!
      );
    }

    const rows = await this.db
      .select({
        id: schema.invoices.id,
        invoiceNumber: schema.invoices.invoiceNumber,
        invoiceType: schema.invoices.invoiceType,
        billingScope: schema.invoices.billingScope,
        status: schema.invoices.status,
        recipientPersonId: schema.invoices.recipientPersonId,
        recipientEmail: schema.invoices.recipientEmail,
        totalCents: schema.invoices.totalCents,
        paidCents: schema.invoices.paidCents,
        currency: schema.invoices.currency,
        dueAt: schema.invoices.dueAt,
        paidAt: schema.invoices.paidAt,
        lateFeeAppliedCents: schema.invoices.lateFeeAppliedCents,
        bulkJobId: schema.invoices.bulkJobId,
        createdAt: schema.invoices.createdAt,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName
      })
      .from(schema.invoices)
      .leftJoin(
        schema.persons,
        eq(schema.persons.id, schema.invoices.recipientPersonId)
      )
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.invoices.createdAt))
      .limit(l)
      .offset((p - 1) * l);

    return {
      items: rows.map((r) => ({
        ...r,
        outstandingCents: r.totalCents - r.paidCents,
        recipientName:
          [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
        dueAt: r.dueAt?.toISOString() ?? null,
        paidAt: r.paidAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString()
      })),
      page: p,
      limit: l
    };
  }

  // -------------------------------------------------------------------
  // GET /finance/invoices/:id  (detail with items + payments + installments)
  // -------------------------------------------------------------------
  @Get("invoices/:id/detail")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "Invoice detail bundle: invoice + items + payments + installments."
  })
  async invoiceDetail(@Param("id") id: string) {
    const [inv] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id))
      .limit(1);
    if (!inv) throw new NotFoundException("Invoice not found");
    const items = await this.db
      .select()
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoiceId, id));
    const payments = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.invoiceId, id))
      .orderBy(desc(schema.payments.receivedAt));
    const installments = await this.db
      .select()
      .from(schema.installmentSchedules)
      .where(eq(schema.installmentSchedules.invoiceId, id))
      .orderBy(schema.installmentSchedules.installmentNumber);
    return { invoice: inv, items, payments, installments };
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/bulk  (billingScope fanout)
  // -------------------------------------------------------------------
  @Post("invoices/bulk")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "Bulk-aware invoice creation. Resolves billingScope+targetId to a set of personIds and creates one invoice per person inside one transaction. Idempotent on X-Idempotency-Key header."
  })
  async createBulkInvoice(
    @CurrentUser() user: AuthPrincipal,
    @Headers("x-idempotency-key") idemKey: string,
    @Body() body: CreateInvoiceBodyDto
  ) {
    if (!idemKey) {
      throw new BadRequestException("X-Idempotency-Key header is required");
    }
    // Idempotency short-circuit
    const existing = await this.db
      .select()
      .from(schema.invoices)
      .where(
        or(
          eq(schema.invoices.idempotencyKey, idemKey),
          ilike(schema.invoices.idempotencyKey, `${idemKey}-%`)
        )!
      );
    if (existing.length > 0) {
      return {
        invoices: existing,
        bulkJobId: existing[0]?.bulkJobId ?? null,
        count: existing.length,
        idempotent: true
      };
    }

    // Org exists?
    const [org] = await this.db
      .select()
      .from(schema.orgs)
      .where(eq(schema.orgs.id, body.orgId))
      .limit(1);
    if (!org) throw new NotFoundException("Org not found");

    // Resolve targetId → personIds
    const personIds = await this.resolveScopeTargets(
      body.billingScope,
      body.targetId,
      body.orgId
    );
    if (personIds.length === 0) {
      throw new BadRequestException(
        "No active members found for the selected target."
      );
    }

    // Compute total
    const subtotalCents = body.items.reduce(
      (a, i) => a + (i.unitAmountCents ?? 0) * (i.quantity ?? 1),
      0
    );
    const totalCents = subtotalCents;
    const isBulk = personIds.length > 1;
    const bulkJobId = isBulk ? randomUUID() : null;
    const currency = "USD";

    // One transaction, fan out
    const created = await this.db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [yc] = await tx.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM invoices
        WHERE org_id = ${body.orgId}
          AND EXTRACT(YEAR FROM created_at) = ${year}
      `);
      let nextSeq = (yc?.count ?? 0) + 1;
      const rows: typeof schema.invoices.$inferSelect[] = [];

      for (const personId of personIds) {
        const [person] = await tx
          .select({ email: schema.profiles.email })
          .from(schema.persons)
          .leftJoin(
            schema.profiles,
            eq(schema.profiles.id, schema.persons.userId)
          )
          .where(eq(schema.persons.id, personId))
          .limit(1);

        const invoiceNumber = `INV-${year}-${String(nextSeq++).padStart(
          5,
          "0"
        )}`;

        const [inv] = await tx
          .insert(schema.invoices)
          .values({
            orgId: body.orgId,
            invoiceNumber,
            invoiceType: body.invoiceType ?? "manual",
            billingScope: body.billingScope,
            recipientPersonId: personId,
            recipientEmail: person?.email ?? null,
            teamId: body.billingScope === "team" ? body.targetId : null,
            divisionId: body.billingScope === "division" ? body.targetId : null,
            leagueId: body.billingScope === "league" ? body.targetId : null,
            seasonId: body.billingScope === "season" ? body.targetId : null,
            bulkJobId,
            subtotalCents,
            totalCents,
            paidCents: 0,
            currency,
            status: "draft",
            dueAt: new Date(body.dueAt),
            notes: body.notes ?? null,
            idempotencyKey: isBulk ? `${idemKey}-${personId}` : idemKey,
            feeScheduleId: body.feeScheduleId ?? null,
            issuedAt: new Date()
          })
          .returning();
        if (!inv) continue;

        for (const item of body.items) {
          const qty = item.quantity ?? 1;
          await tx.insert(schema.invoiceItems).values({
            invoiceId: inv.id,
            kind: item.kind,
            description: item.description,
            quantity: qty,
            unitAmountCents: item.unitAmountCents,
            amountCents: item.unitAmountCents * qty,
            feeScheduleId: body.feeScheduleId ?? null
          });
        }

        // Optional payment plan
        if (
          body.paymentPlanEnabled &&
          body.depositCents != null &&
          body.installmentCount != null &&
          body.installmentCount > 0
        ) {
          const remainingCents = totalCents - body.depositCents;
          const baseInstallment = Math.floor(
            remainingCents / body.installmentCount
          );
          const remainder = remainingCents % body.installmentCount;
          const startDate = body.installmentStartDate
            ? new Date(body.installmentStartDate)
            : new Date();

          await tx.insert(schema.installmentSchedules).values({
            invoiceId: inv.id,
            installmentNumber: 0,
            amountCents: body.depositCents,
            dueDate: new Date(),
            status: "scheduled"
          });
          for (let i = 1; i <= body.installmentCount; i++) {
            const amount =
              i === body.installmentCount
                ? baseInstallment + remainder
                : baseInstallment;
            const dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() + (i - 1) * 30);
            await tx.insert(schema.installmentSchedules).values({
              invoiceId: inv.id,
              installmentNumber: i,
              amountCents: amount,
              dueDate,
              status: "scheduled"
            });
          }
        }

        rows.push(inv);
      }
      return rows;
    });

    return {
      invoices: created,
      bulkJobId,
      count: created.length
    };
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/apply-wallet-credit  (player)
  // -------------------------------------------------------------------
  @Post("invoices/:id/apply-wallet-credit")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Player applies wallet credit to their own invoice. Atomic: debits wallet_accounts, inserts wallet_transactions, advances paid_cents."
  })
  async applyWalletCredit(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: ApplyWalletCreditBodyDto
  ) {
    const personId = await this.resolvePersonId(user.userId);
    if (!personId) throw new ForbiddenException("No person record");

    return await this.db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.recipientPersonId !== personId) {
        throw new ForbiddenException("Not your invoice");
      }

      const [wallet] = await tx
        .select()
        .from(schema.walletAccounts)
        .where(
          and(
            eq(schema.walletAccounts.personId, personId),
            eq(schema.walletAccounts.orgId, inv.orgId)
          )
        )
        .limit(1);
      if (!wallet) throw new NotFoundException("No wallet found");
      if (wallet.balanceCents < body.walletCents) {
        throw new BadRequestException("Insufficient wallet balance");
      }

      const outstanding =
        inv.totalCents - inv.paidCents - inv.walletCreditAppliedCents;
      const applyAmount = Math.min(body.walletCents, outstanding);
      const newPaidCents = inv.paidCents + applyAmount;
      const newStatus =
        newPaidCents >= inv.totalCents ? "paid" : inv.status;

      await tx
        .update(schema.walletAccounts)
        .set({
          balanceCents: wallet.balanceCents - applyAmount,
          updatedAt: new Date()
        })
        .where(eq(schema.walletAccounts.id, wallet.id));

      await tx.insert(schema.walletTransactions).values({
        walletId: wallet.id,
        type: "credit_applied",
        amountCents: applyAmount,
        invoiceId,
        reason: "Applied to invoice"
      });

      await tx
        .update(schema.invoices)
        .set({
          walletCreditAppliedCents:
            inv.walletCreditAppliedCents + applyAmount,
          paidCents: newPaidCents,
          status: newStatus,
          paidAt: newStatus === "paid" ? new Date() : inv.paidAt,
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, invoiceId));

      return {
        appliedCents: applyAmount,
        newStatus,
        remainingWalletCents: wallet.balanceCents - applyAmount
      };
    });
  }

  // -------------------------------------------------------------------
  // POST /finance/invoices/:id/refund-gateway  (admin)
  // POST /finance/invoices/:id/refund-wallet   (admin)
  // Single-type variants; the existing /refund-split handles split.
  // -------------------------------------------------------------------
  @Post("invoices/:id/refund")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "Issue a refund — refundType 'gateway' (mocked Stripe) or 'wallet' (wallet credit). Reason ≥ 10 chars."
  })
  async refund(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") invoiceId: string,
    @Body() body: RefundBodyDto
  ) {
    if (body.reason.trim().length < 10) {
      throw new UnprocessableEntityException(
        "Reason must be at least 10 characters."
      );
    }
    return await this.db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.status !== "paid" && inv.status !== "partial") {
        throw new BadRequestException(
          "Can only refund paid or partial invoices."
        );
      }
      if (body.amountCents > inv.paidCents) {
        throw new BadRequestException("Refund exceeds amount paid.");
      }

      if (body.refundType === "gateway") {
        await tx.insert(schema.payments).values({
          orgId: inv.orgId,
          invoiceId,
          amountCents: body.amountCents,
          currency: inv.currency,
          method: "refund",
          status: "succeeded",
          notes: body.reason.trim(),
          recordedByUserId: user.userId
        });
        const newPaidCents = inv.paidCents - body.amountCents;
        await tx
          .update(schema.invoices)
          .set({
            paidCents: newPaidCents,
            status: newPaidCents <= 0 ? "sent" : "partial",
            updatedAt: new Date()
          })
          .where(eq(schema.invoices.id, invoiceId));
      } else {
        // Wallet refund
        if (!inv.recipientPersonId) {
          throw new BadRequestException(
            "Cannot issue wallet refund — invoice has no recipient person."
          );
        }
        let [wallet] = await tx
          .select()
          .from(schema.walletAccounts)
          .where(
            and(
              eq(schema.walletAccounts.personId, inv.recipientPersonId),
              eq(schema.walletAccounts.orgId, inv.orgId)
            )
          )
          .limit(1);
        if (!wallet) {
          const created = await tx
            .insert(schema.walletAccounts)
            .values({
              personId: inv.recipientPersonId,
              orgId: inv.orgId,
              currency: inv.currency,
              balanceCents: 0
            })
            .returning();
          wallet = created[0]!;
        }
        await tx
          .update(schema.walletAccounts)
          .set({
            balanceCents: wallet.balanceCents + body.amountCents,
            updatedAt: new Date()
          })
          .where(eq(schema.walletAccounts.id, wallet.id));
        await tx.insert(schema.walletTransactions).values({
          walletId: wallet.id,
          type: "refund_received",
          amountCents: body.amountCents,
          invoiceId,
          reason: body.reason.trim(),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
        });
      }

      // QB outbox event
      await tx.insert(schema.quickbooksSyncEvents).values({
        orgId: inv.orgId,
        eventType: "invoices.refund",
        resourceType: "invoice",
        resourceId: invoiceId,
        payload: {
          refundType: body.refundType,
          amountCents: body.amountCents,
          reason: body.reason.trim()
        },
        status: "pending"
      });

      const [updated] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .limit(1);
      return { invoice: updated };
    });
  }

  // -------------------------------------------------------------------
  // PATCH /finance/invoices/:id  (extend due date)
  // -------------------------------------------------------------------
  @Patch("invoices/:id")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "Extend due date. Strips overdue flag when new date is in the future."
  })
  async extendDueDate(
    @Param("id") invoiceId: string,
    @Body() body: PatchInvoiceBodyDto
  ) {
    const [inv] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundException("Invoice not found");
    if (inv.status === "void") {
      throw new BadRequestException("Cannot edit a voided invoice.");
    }
    const newDue = new Date(body.dueAt);
    const newStatus =
      inv.status === "overdue" && newDue > new Date()
        ? inv.paidCents > 0
          ? "partial"
          : "sent"
        : inv.status;
    await this.db
      .update(schema.invoices)
      .set({ dueAt: newDue, status: newStatus, updatedAt: new Date() })
      .where(eq(schema.invoices.id, invoiceId));
    return { invoiceId, dueAt: newDue.toISOString(), status: newStatus };
  }

  // -------------------------------------------------------------------
  // POST /finance/team-invoices/:id/split  (captain)
  // -------------------------------------------------------------------
  @Post("team-invoices/:id/split")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Split a team_dues master invoice into sub_invoices. Even or custom split; sum-equals-total enforced (±1¢)."
  })
  async splitTeamInvoice(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") masterInvoiceId: string,
    @Body() body: TeamSplitBodyDto
  ) {
    const [master] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, masterInvoiceId))
      .limit(1);
    if (!master) throw new NotFoundException("Master invoice not found");
    if (master.invoiceType !== "team_dues") {
      throw new BadRequestException("Not a team_dues master invoice");
    }
    if (!master.teamId) {
      throw new BadRequestException("Master invoice has no team_id");
    }

    // Captain check
    const [team] = await this.db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, master.teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    if (team.captainUserId !== user.userId) {
      const [profile] = await this.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, user.userId))
        .limit(1);
      if (!profile?.isSuperAdmin) {
        throw new ForbiddenException("Not the captain of this team");
      }
    }

    // Active members
    const members = await this.db
      .select({
        personId: schema.teamMemberships.personId,
        userId: schema.persons.userId
      })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.persons,
        eq(schema.persons.id, schema.teamMemberships.personId)
      )
      .where(
        and(
          eq(schema.teamMemberships.teamId, master.teamId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );

    const includeCaption = body.includeCaption ?? true;
    const captainPersonId = team.captainUserId
      ? members.find((m) => m.userId === team.captainUserId)?.personId
      : null;
    const players = includeCaption
      ? members
      : members.filter((m) => m.personId !== captainPersonId);

    if (players.length === 0) {
      throw new BadRequestException(
        "No members to split this invoice across."
      );
    }

    // Compute per-player amounts
    let splits: Array<{ personId: string; amountCents: number }>;
    if (body.method === "even") {
      const base = Math.floor(master.totalCents / players.length);
      const remainder = master.totalCents % players.length;
      splits = players.map((p, i) => ({
        personId: p.personId,
        amountCents: i === players.length - 1 ? base + remainder : base
      }));
    } else {
      if (!body.customAmounts) {
        throw new BadRequestException(
          "customAmounts is required for method='custom'"
        );
      }
      const sum = body.customAmounts.reduce((a, x) => a + x.amountCents, 0);
      if (Math.abs(sum - master.totalCents) > 1) {
        throw new UnprocessableEntityException(
          `Split amounts do not equal total invoice amount (sum=${sum}, total=${master.totalCents})`
        );
      }
      splits = body.customAmounts.map((c) => ({
        personId: c.personId,
        amountCents: c.amountCents
      }));
    }

    return await this.db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [yc] = await tx.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM invoices
        WHERE org_id = ${master.orgId}
          AND EXTRACT(YEAR FROM created_at) = ${year}
      `);
      let nextSeq = (yc?.count ?? 0) + 1;
      const subInvoices: typeof schema.invoices.$inferSelect[] = [];

      for (const s of splits) {
        const [person] = await tx
          .select({ email: schema.profiles.email })
          .from(schema.persons)
          .leftJoin(
            schema.profiles,
            eq(schema.profiles.id, schema.persons.userId)
          )
          .where(eq(schema.persons.id, s.personId))
          .limit(1);
        const invoiceNumber = `INV-${year}-${String(nextSeq++).padStart(
          5,
          "0"
        )}`;
        const [sub] = await tx
          .insert(schema.invoices)
          .values({
            orgId: master.orgId,
            invoiceNumber,
            invoiceType: "sub_invoice",
            parentInvoiceId: master.id,
            billingScope: "individual",
            recipientPersonId: s.personId,
            recipientEmail: person?.email ?? null,
            subtotalCents: s.amountCents,
            totalCents: s.amountCents,
            paidCents: 0,
            currency: master.currency,
            status: "draft",
            dueAt: new Date(body.dueAt),
            issuedAt: new Date(),
            idempotencyKey: `split-${master.id}-${s.personId}`
          })
          .returning();
        if (!sub) continue;
        await tx.insert(schema.invoiceItems).values({
          invoiceId: sub.id,
          kind: "registration_fee",
          description: `${master.invoiceNumber} — split share`,
          quantity: 1,
          unitAmountCents: s.amountCents,
          amountCents: s.amountCents
        });
        subInvoices.push(sub);
      }

      const masterMeta = (master.metadata as Record<string, unknown>) ?? {};
      await tx
        .update(schema.invoices)
        .set({
          metadata: {
            ...masterMeta,
            splitConfigured: true,
            splitMethod: body.method
          },
          updatedAt: new Date()
        })
        .where(eq(schema.invoices.id, master.id));

      return { subInvoices, count: subInvoices.length };
    });
  }

  // -------------------------------------------------------------------
  // POST /finance/team-invoices/:id/cover-outstanding  (captain)
  // -------------------------------------------------------------------
  @Post("team-invoices/:id/cover-outstanding")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Captain pays the full unpaid balance of every sub_invoice in one charge. Idempotent via X-Idempotency-Key. Each sub-invoice gets a payment row + 'captain.covered_dues' notification."
  })
  async coverOutstandingTeamInvoice(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") masterInvoiceId: string,
    @Headers("x-idempotency-key") idemKey?: string
  ) {
    if (!idemKey) {
      throw new BadRequestException("X-Idempotency-Key header is required");
    }
    const [master] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, masterInvoiceId))
      .limit(1);
    if (!master) throw new NotFoundException("Master invoice not found");
    if (!master.teamId) {
      throw new BadRequestException("Master invoice has no team_id");
    }
    const [team] = await this.db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, master.teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    if (team.captainUserId !== user.userId) {
      const [profile] = await this.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, user.userId))
        .limit(1);
      if (!profile?.isSuperAdmin) {
        throw new ForbiddenException("Not the captain of this team");
      }
    }

    return await this.db.transaction(async (tx) => {
      const subs = await tx
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.parentInvoiceId, masterInvoiceId),
            eq(schema.invoices.invoiceType, "sub_invoice"),
            inArray(schema.invoices.status, ["sent", "partial", "overdue"])
          )
        );
      const outstanding = subs
        .filter((s) => s.paidCents < s.totalCents)
        .map((s) => ({ sub: s, owe: s.totalCents - s.paidCents }));
      const totalOutstanding = outstanding.reduce((a, x) => a + x.owe, 0);
      if (totalOutstanding === 0) {
        throw new BadRequestException("No outstanding balances to cover");
      }

      const playersCovered: string[] = [];
      for (const o of outstanding) {
        await tx.insert(schema.payments).values({
          orgId: master.orgId,
          invoiceId: o.sub.id,
          amountCents: o.owe,
          currency: master.currency,
          method: "credit_card",
          status: "succeeded",
          notes: "Covered by captain",
          externalProviderId: `${idemKey}:${o.sub.id}`,
          recordedByUserId: user.userId
        });
        await tx
          .update(schema.invoices)
          .set({
            paidCents: o.sub.totalCents,
            status: "paid",
            paidAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(schema.invoices.id, o.sub.id));
        if (o.sub.recipientPersonId) {
          playersCovered.push(o.sub.recipientPersonId);
          await tx
            .insert(schema.notifications)
            .values({
              orgId: master.orgId,
              idempotencyKey: `dues-covered-${o.sub.id}-${idemKey}`,
              templateCode: "captain.covered_dues",
              channel: "email",
              body: `Your dues were covered by your captain (${master.invoiceNumber}).`,
              recipientPersonId: o.sub.recipientPersonId,
              recipientEmail: o.sub.recipientEmail,
              payload: { invoiceId: o.sub.id, amountCents: o.owe },
              sourceEvent: "captain.cover_outstanding",
              status: "queued"
            })
            .onConflictDoNothing({
              target: schema.notifications.idempotencyKey
            });
        }
      }

      return { totalCoveredCents: totalOutstanding, playersCovered };
    });
  }

  // -------------------------------------------------------------------
  // GET /finance/team-invoices/:id/collection-status  (captain)
  // -------------------------------------------------------------------
  @Get("team-invoices/:id/collection-status")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Captain dashboard — collection progress vs confirmation threshold + per-player split status."
  })
  async collectionStatus(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") masterInvoiceId: string
  ) {
    const [master] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, masterInvoiceId))
      .limit(1);
    if (!master) throw new NotFoundException("Master invoice not found");
    if (!master.teamId) {
      throw new BadRequestException("Master invoice has no team_id");
    }
    const [team] = await this.db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, master.teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    if (team.captainUserId !== user.userId) {
      const [profile] = await this.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, user.userId))
        .limit(1);
      if (!profile?.isSuperAdmin) {
        throw new ForbiddenException("Not the captain of this team");
      }
    }

    const subs = await this.db
      .select({
        id: schema.invoices.id,
        recipientPersonId: schema.invoices.recipientPersonId,
        totalCents: schema.invoices.totalCents,
        paidCents: schema.invoices.paidCents,
        status: schema.invoices.status,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName
      })
      .from(schema.invoices)
      .leftJoin(
        schema.persons,
        eq(schema.persons.id, schema.invoices.recipientPersonId)
      )
      .where(
        and(
          eq(schema.invoices.parentInvoiceId, masterInvoiceId),
          eq(schema.invoices.invoiceType, "sub_invoice")
        )
      );

    const collectedCents = subs.reduce((a, s) => a + s.paidCents, 0);
    const confirmationThresholdCents = team.confirmationThresholdCents ?? 0;
    return {
      masterInvoice: {
        id: master.id,
        totalCents: master.totalCents,
        status: master.status
      },
      confirmationThresholdCents,
      collectedCents,
      pct: confirmationThresholdCents
        ? Math.min(
            100,
            Math.round((collectedCents / confirmationThresholdCents) * 100)
          )
        : 0,
      players: subs.map((s) => ({
        personId: s.recipientPersonId,
        name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        splitAmountCents: s.totalCents,
        paidCents: s.paidCents,
        status: s.status
      }))
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async resolvePersonId(userId: string): Promise<string | null> {
    const [p] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    return p?.id ?? null;
  }

  private async resolveScopeTargets(
    scope: string,
    targetId: string,
    orgId: string
  ): Promise<string[]> {
    if (scope === "individual") {
      const [p] = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(eq(schema.persons.id, targetId))
        .limit(1);
      if (!p) throw new NotFoundException("Person not found in this org");
      return [p.id];
    }
    if (scope === "team") {
      const rows = await this.db
        .select({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, targetId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return [...new Set(rows.map((r) => r.personId))];
    }
    if (scope === "division") {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.divisionTeamEntries,
          eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId)
        )
        .where(
          and(
            eq(schema.divisionTeamEntries.divisionId, targetId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "confirmed"
            ]),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    if (scope === "league") {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.divisionTeamEntries,
          eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId)
        )
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .innerJoin(
          schema.seasons,
          eq(schema.seasons.id, schema.divisions.seasonId)
        )
        .where(
          and(
            eq(schema.seasons.leagueId, targetId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "confirmed"
            ]),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    if (scope === "season") {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.divisionTeamEntries,
          eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId)
        )
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            eq(schema.divisions.seasonId, targetId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "confirmed"
            ]),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    if (scope === "org") {
      // Persons with at least one active membership in any team in this org
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.teams,
          eq(schema.teams.id, schema.teamMemberships.teamId)
        )
        .where(
          and(
            eq(schema.teams.orgId, orgId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    throw new BadRequestException(`Unknown billingScope: ${scope}`);
  }
}
