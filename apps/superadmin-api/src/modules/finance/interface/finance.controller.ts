import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { orgVisible } from "../../../shared/auth/visibility";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { assertInvoiceInScope } from "../application/services/finance-scope";
import {
  FeeSchedulePageDto,
  FeeScheduleDto,
  InvoiceDto,
  InvoicePageDto,
  PaymentDto
} from "../application/dtos/finance.dto";
import {
  GetInvoiceHandler,
  ListFeeSchedulesHandler,
  ListInvoicePaymentsHandler,
  ListInvoicesHandler
} from "../application/handlers/queries";
import {
  CreateInvoiceHandler,
  MarkInvoiceSentHandler,
  ReconcileInvoiceHandler,
  RecordPaymentHandler,
  UpsertFeeScheduleHandler,
  VoidInvoiceHandler
} from "../application/handlers/commands";
import {
  CreateInvoiceBodyDto,
  ListFeeSchedulesQueryDto,
  ListInvoicesQueryDto,
  RecordPaymentBodyDto,
  UpsertFeeScheduleBodyDto,
  VoidInvoiceBodyDto
} from "./dto/finance.dto";

@ApiTags("finance")
@ApiBearerAuth()
@Controller("finance")
@UseGuards(JwtAuthGuard)
export class FinanceController {
  // Super admin only unless a method says ScopedAdminGuard: scoped admins
  // (org / league admins) act on invoices inside their scope; anything
  // outside it is a 404.
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly listSchedulesH: ListFeeSchedulesHandler,
    private readonly upsertScheduleH: UpsertFeeScheduleHandler,
    private readonly listInvoicesH: ListInvoicesHandler,
    private readonly getInvoiceH: GetInvoiceHandler,
    private readonly createInvoiceH: CreateInvoiceHandler,
    private readonly markSentH: MarkInvoiceSentHandler,
    private readonly voidH: VoidInvoiceHandler,
    private readonly reconcileH: ReconcileInvoiceHandler,
    private readonly listPaysH: ListInvoicePaymentsHandler,
    private readonly recordPayH: RecordPaymentHandler
  ) {}

  // ---- Fee schedules ----
  @Get("fee-schedules")
  @UseGuards(ScopedAdminGuard)
  listSchedules(@Query() q: ListFeeSchedulesQueryDto, @UserScope() scope: UserScopeType): Promise<FeeSchedulePageDto> {
    // A scoped admin reads one of their own orgs' schedules.
    if (!scope.isSuperAdmin && (!q.orgId || !orgVisible(scope, q.orgId))) {
      throw new NotFoundException("Org not found");
    }
    return this.listSchedulesH.execute(q);
  }
  @Post("fee-schedules")
  @UseGuards(SuperAdminGuard)
  createSchedule(@Body() body: UpsertFeeScheduleBodyDto): Promise<FeeScheduleDto> {
    return this.upsertScheduleH.execute(body);
  }
  @Patch("fee-schedules/:id")
  @UseGuards(SuperAdminGuard)
  updateSchedule(
    @Param("id") id: string,
    @Body() body: UpsertFeeScheduleBodyDto
  ): Promise<FeeScheduleDto> {
    return this.upsertScheduleH.execute({ id, ...body });
  }

  // ---- Invoices ----
  @Get("invoices") @ApiOperation({ summary: "List invoices (newest first)" })
  @UseGuards(SuperAdminGuard)
  listInvoices(@Query() q: ListInvoicesQueryDto): Promise<InvoicePageDto> {
    return this.listInvoicesH.execute(q);
  }
  @Get("invoices/:id")
  @UseGuards(ScopedAdminGuard)
  async getInvoice(@Param("id") id: string, @UserScope() scope: UserScopeType): Promise<InvoiceDto> {
    await assertInvoiceInScope(this.db, scope, id);
    return this.getInvoiceH.execute({ id });
  }
  @Post("invoices") @ApiOperation({ summary: "Create an invoice with line items" })
  @UseGuards(SuperAdminGuard)
  createInvoice(@Body() body: CreateInvoiceBodyDto): Promise<InvoiceDto> {
    return this.createInvoiceH.execute({
      ...body,
      dueAt: body.dueAt ? new Date(body.dueAt) : null
    });
  }
  @Post("invoices/:id/send")
  @UseGuards(ScopedAdminGuard)
  @AllowScopedWrite()
  async send(@Param("id") id: string, @UserScope() scope: UserScopeType): Promise<InvoiceDto> {
    await assertInvoiceInScope(this.db, scope, id);
    return this.markSentH.execute({ id });
  }
  @Post("invoices/:id/void")
  @UseGuards(ScopedAdminGuard)
  @AllowScopedWrite()
  async voidInvoice(
    @Param("id") id: string,
    @Body() body: VoidInvoiceBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<InvoiceDto> {
    await assertInvoiceInScope(this.db, scope, id);
    return this.voidH.execute({ id, reason: body.reason });
  }
  @Post("invoices/:id/reconcile")
  @UseGuards(SuperAdminGuard)
  reconcile(@Param("id") id: string): Promise<InvoiceDto> {
    return this.reconcileH.execute({ id });
  }

  // ---- Payments ----
  @Get("invoices/:id/payments")
  @UseGuards(ScopedAdminGuard)
  async listPays(@Param("id") invoiceId: string, @UserScope() scope: UserScopeType): Promise<PaymentDto[]> {
    await assertInvoiceInScope(this.db, scope, invoiceId);
    return this.listPaysH.execute({ invoiceId });
  }
  @Post("invoices/:id/payments")
  @UseGuards(ScopedAdminGuard)
  @AllowScopedWrite()
  @ApiOperation({ summary: "Manually record a payment against an invoice" })
  async recordPayment(
    @Param("id") invoiceId: string,
    @Body() body: RecordPaymentBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<PaymentDto> {
    await assertInvoiceInScope(this.db, scope, invoiceId);
    // The payment belongs to the invoice's org, whatever orgId the body says.
    const [inv] = await this.db
      .select({ orgId: schema.invoices.orgId })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);
    return this.recordPayH.execute({
      ...body,
      orgId: inv?.orgId ?? body.orgId,
      invoiceId,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      recordedByUserId: user.userId
    });
  }
}
