import {
  Inject,
  Injectable,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  FINANCE_REPOSITORY,
  type FinanceRepository,
  type RecordPaymentInput,
  type UpsertFeeScheduleInput
} from "../../domain/repositories/finance.repository";
import {
  FeeScheduleDto,
  InvoiceDto,
  PaymentDto
} from "../dtos/finance.dto";

@Injectable()
export class UpsertFeeScheduleHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute(
    input: UpsertFeeScheduleInput & { id?: string }
  ): Promise<FeeScheduleDto> {
    const row = await this.repo.upsertFeeSchedule(input);
    return FeeScheduleDto.fromRow(row);
  }
}

@Injectable()
export class CreateInvoiceHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute(input: Parameters<FinanceRepository["createInvoice"]>[0]) {
    const row = await this.repo.createInvoice(input);
    return InvoiceDto.fromRow(row);
  }
}

@Injectable()
export class MarkInvoiceSentHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute({ id }: { id: string }) {
    const row = await this.repo.markSent(id);
    return InvoiceDto.fromRow(row);
  }
}

@Injectable()
export class VoidInvoiceHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute(input: { id: string; reason?: string }) {
    const row = await this.repo.voidInvoice(input.id, input.reason);
    return InvoiceDto.fromRow(row);
  }
}

@Injectable()
export class RecordPaymentHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute(input: RecordPaymentInput): Promise<PaymentDto> {
    // Reject overpayment before writing the row (BUG-041). Previously the
    // repo blindly inserted any amount and reconcileStatus flipped the
    // invoice to "paid" with paid_cents > total_cents.
    const invoice = await this.repo.findInvoice(input.invoiceId);
    if (invoice && (input.status ?? "succeeded") === "succeeded") {
      const remaining = invoice.totalCents - invoice.paidCents;
      if (input.amountCents > remaining) {
        throw new UnprocessableEntityException({
          error: "payment_exceeds_remaining",
          message: `Payment of ${input.amountCents} exceeds remaining ${remaining} on invoice ${input.invoiceId}.`,
          totalCents: invoice.totalCents,
          paidCents: invoice.paidCents,
          remainingCents: remaining,
          attemptedAmountCents: input.amountCents
        });
      }
      if (invoice.status === "void") {
        throw new UnprocessableEntityException({
          error: "invoice_void",
          message: `Invoice ${input.invoiceId} is void; payments cannot be recorded.`
        });
      }
    }
    const row = await this.repo.recordPayment(input);
    return PaymentDto.fromRow(row);
  }
}

@Injectable()
export class ReconcileInvoiceHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute({ id }: { id: string }) {
    const row = await this.repo.reconcileStatus(id);
    return InvoiceDto.fromRow(row);
  }
}
