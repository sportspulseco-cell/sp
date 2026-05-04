import {
  Body,
  Controller,
  Get,
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
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceController {
  constructor(
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
  listSchedules(@Query() q: ListFeeSchedulesQueryDto): Promise<FeeSchedulePageDto> {
    return this.listSchedulesH.execute(q);
  }
  @Post("fee-schedules")
  createSchedule(@Body() body: UpsertFeeScheduleBodyDto): Promise<FeeScheduleDto> {
    return this.upsertScheduleH.execute(body);
  }
  @Patch("fee-schedules/:id")
  updateSchedule(
    @Param("id") id: string,
    @Body() body: UpsertFeeScheduleBodyDto
  ): Promise<FeeScheduleDto> {
    return this.upsertScheduleH.execute({ id, ...body });
  }

  // ---- Invoices ----
  @Get("invoices") @ApiOperation({ summary: "List invoices (newest first)" })
  listInvoices(@Query() q: ListInvoicesQueryDto): Promise<InvoicePageDto> {
    return this.listInvoicesH.execute(q);
  }
  @Get("invoices/:id")
  getInvoice(@Param("id") id: string): Promise<InvoiceDto> {
    return this.getInvoiceH.execute({ id });
  }
  @Post("invoices") @ApiOperation({ summary: "Create an invoice with line items" })
  createInvoice(@Body() body: CreateInvoiceBodyDto): Promise<InvoiceDto> {
    return this.createInvoiceH.execute({
      ...body,
      dueAt: body.dueAt ? new Date(body.dueAt) : null
    });
  }
  @Post("invoices/:id/send")
  send(@Param("id") id: string): Promise<InvoiceDto> {
    return this.markSentH.execute({ id });
  }
  @Post("invoices/:id/void")
  voidInvoice(
    @Param("id") id: string,
    @Body() body: VoidInvoiceBodyDto
  ): Promise<InvoiceDto> {
    return this.voidH.execute({ id, reason: body.reason });
  }
  @Post("invoices/:id/reconcile")
  reconcile(@Param("id") id: string): Promise<InvoiceDto> {
    return this.reconcileH.execute({ id });
  }

  // ---- Payments ----
  @Get("invoices/:id/payments")
  listPays(@Param("id") invoiceId: string): Promise<PaymentDto[]> {
    return this.listPaysH.execute({ invoiceId });
  }
  @Post("invoices/:id/payments")
  @ApiOperation({ summary: "Manually record a payment against an invoice" })
  recordPayment(
    @Param("id") invoiceId: string,
    @Body() body: RecordPaymentBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<PaymentDto> {
    return this.recordPayH.execute({
      ...body,
      invoiceId,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      recordedByUserId: user.userId
    });
  }
}
