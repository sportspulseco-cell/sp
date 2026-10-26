import { loadInvoiceDetail } from "../application/services/invoice-detail";
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
  UseGuards,
  Put,
  ParseUUIDPipe
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
  ValidateNested,
  MaxLength
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
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { InvoicingService } from "../application/services/invoicing.service";
import { RefundService } from "../application/services/refund.service";
import { BulkCreateInvoiceBodyDto } from "./dto/bulk-invoice.dto";
import { settleInstallments } from "../application/services/installments";

// =====================================================================
// DTOs
// =====================================================================

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

class InvoiceNoteBodyDto {
  @IsString() @MaxLength(4000) note!: string;
}

@ApiTags("finance/invoicing")
@ApiBearerAuth()
@Controller("finance")
export class FinanceInvoicingController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly invoicing: InvoicingService,
    private readonly refunds: RefundService
  ) {}

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
    }>(sql`
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
      FROM invoices i
      WHERE ${orgId ? sql`i.org_id = ${orgId}` : sql`true`}
        -- A team invoice with player shares is their container: count the
        -- shares, not the container as well (MON-23).
        AND NOT (
          i.invoice_type = 'team_dues'
          AND EXISTS (SELECT 1 FROM invoices c WHERE c.parent_invoice_id = i.id)
        )
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
  // GET /finance/admin/invoices?orgId&status&billingScope&search&page&limit
  // (Renamed from /invoices/list — that path was eaten by the
  // sibling `/invoices/:id` route, which tried to cast "list" as a UUID.)
  // -------------------------------------------------------------------
  @Get("admin/invoices")
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
      "Invoice detail bundle: invoice + items + payments + installments + refunds + server-computed refundable amounts."
  })
  async invoiceDetail(@Param("id") id: string) {
    const detail = await loadInvoiceDetail(this.db, id);
    if (!detail) throw new NotFoundException("Invoice not found");
    // Server-computed limits so no screen derives them from paid_cents.
    const refundable = await this.refunds.refundable(id);
    return { ...detail, refundable };
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
    @CurrentUser() _user: AuthPrincipal,
    @Headers("x-idempotency-key") idemKey: string,
    @Body() body: BulkCreateInvoiceBodyDto
  ) {
    return this.invoicing.createBulkInvoice(idemKey, body);
  }

  // POST /finance/invoices/:id/apply-wallet-credit was removed with the
  // refund endpoint (MON-9): no caller, and it wrote wallet_transactions,
  // a second wallet ledger. Players spend wallet credit through
  // POST /finance/invoices/:id/pay (walletAmountCents), which writes
  // wallet_ledger, the one wallet ledger.
  // POST /finance/invoices/:id/refund was removed (MON-9): it wrote a
  // second wallet ledger (wallet_transactions) and had no caller. Every
  // refund goes through RefundService via POST /finance/invoices/:id/refund-split.

  // -------------------------------------------------------------------
  // PUT /finance/invoices/:id/note  (internal note, MON-18)
  // -------------------------------------------------------------------
  @Put("invoices/:id/note")
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({
    summary:
      "Save the invoice's internal note (admins only; never shown to the payer). Stored on the invoice with who saved it and when."
  })
  async saveNote(
    @Param("id", ParseUUIDPipe) invoiceId: string,
    @Body() body: InvoiceNoteBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const note = body.note.trim();
    const meta = {
      internalNote: note,
      internalNoteUpdatedAt: new Date().toISOString(),
      internalNoteUpdatedBy: user.userId
    };
    const rows = await this.db
      .update(schema.invoices)
      .set({
        // Merge into an object; a row whose metadata is not an object
        // starts from {} rather than turning into an array.
        metadata: sql`(case when jsonb_typeof(${schema.invoices.metadata}) = 'object' then ${schema.invoices.metadata} else '{}'::jsonb end) || ${JSON.stringify(meta)}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(schema.invoices.id, invoiceId))
      .returning({ id: schema.invoices.id, metadata: schema.invoices.metadata });
    if (rows.length !== 1) throw new NotFoundException("Invoice not found");
    const saved = (rows[0]!.metadata as Record<string, unknown> | null)?.internalNote;
    if (saved !== note) throw new Error(`invoice ${invoiceId}: note readback does not match`);
    return { invoiceId, internalNote: note, internalNoteUpdatedAt: meta.internalNoteUpdatedAt };
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
    if (
      !(await userIsCaptainOfTeam(
        this.db,
        user.userId,
        team.id,
        team.captainUserId
      ))
    ) {
      throw new ForbiddenException("Not the captain of this team");
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
        await settleInstallments(tx, o.sub.id);
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
    if (
      !(await userIsCaptainOfTeam(
        this.db,
        user.userId,
        team.id,
        team.captainUserId
      ))
    ) {
      throw new ForbiddenException("Not the captain of this team");
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

}
