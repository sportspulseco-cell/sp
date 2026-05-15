import { Module } from "@nestjs/common";
import { FinanceController } from "./interface/finance.controller";
import { FinanceSplitsController } from "./interface/splits.controller";
import { FinanceRefundsController } from "./interface/refunds.controller";
import { FinanceWalletController } from "./interface/wallet.controller";
import { FinanceEscalationsController } from "./interface/escalations.controller";
import { FinanceQuickbooksSyncController } from "./interface/quickbooks-sync.controller";
import { PlayerPaymentsController } from "./interface/player-payments.controller";
import { FinanceArActionsController } from "./interface/ar-actions.controller";
import { CaptainDuesController } from "./interface/captain-dues.controller";
import { FinanceInvoicingController } from "./interface/invoicing.controller";
import { FinanceService } from "./application/finance.service";
import {
  GetInvoiceHandler,
  ListFeeSchedulesHandler,
  ListInvoicePaymentsHandler,
  ListInvoicesHandler
} from "./application/handlers/queries";
import {
  CreateInvoiceHandler,
  MarkInvoiceSentHandler,
  ReconcileInvoiceHandler,
  RecordPaymentHandler,
  UpsertFeeScheduleHandler,
  VoidInvoiceHandler
} from "./application/handlers/commands";
import { FINANCE_REPOSITORY } from "./domain/repositories/finance.repository";
import { DrizzleFinanceRepository } from "./infrastructure/repositories/drizzle-finance.repository";
import {
  MockPaymentProcessor,
  PAYMENT_PROCESSOR
} from "../../shared/payments/payment-processor";

@Module({
  controllers: [
    FinanceController,
    FinanceSplitsController,
    FinanceRefundsController,
    FinanceWalletController,
    FinanceEscalationsController,
    FinanceQuickbooksSyncController,
    PlayerPaymentsController,
    FinanceArActionsController,
    CaptainDuesController,
    FinanceInvoicingController
  ],
  providers: [
    FinanceService,
    ListFeeSchedulesHandler,
    UpsertFeeScheduleHandler,
    ListInvoicesHandler,
    GetInvoiceHandler,
    CreateInvoiceHandler,
    MarkInvoiceSentHandler,
    VoidInvoiceHandler,
    ReconcileInvoiceHandler,
    ListInvoicePaymentsHandler,
    RecordPaymentHandler,
    { provide: FINANCE_REPOSITORY, useClass: DrizzleFinanceRepository },
    // Payment processor seam — mock today; swap to real Stripe by
    // changing this single provider line.
    { provide: PAYMENT_PROCESSOR, useClass: MockPaymentProcessor }
  ],
  exports: [FinanceService, PAYMENT_PROCESSOR, RecordPaymentHandler]
})
export class FinanceModule {}
