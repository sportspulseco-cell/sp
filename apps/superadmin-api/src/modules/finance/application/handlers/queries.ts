import { Inject, Injectable } from "@nestjs/common";
import { clampLimit, NotFoundError } from "@sportspulse/kernel";
import {
  FINANCE_REPOSITORY,
  type FinanceRepository,
  type ListFeeSchedulesQuery,
  type ListInvoicesQuery
} from "../../domain/repositories/finance.repository";
import {
  FeeScheduleDto,
  FeeSchedulePageDto,
  InvoiceDto,
  InvoicePageDto,
  PaymentDto
} from "../dtos/finance.dto";

@Injectable()
export class ListFeeSchedulesHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute(
    q: Partial<ListFeeSchedulesQuery> = {}
  ): Promise<FeeSchedulePageDto> {
    const page = await this.repo.listFeeSchedules({
      ...q,
      limit: clampLimit(q.limit)
    });
    return {
      items: page.items.map((r) => FeeScheduleDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class ListInvoicesHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute(q: Partial<ListInvoicesQuery> = {}): Promise<InvoicePageDto> {
    const page = await this.repo.listInvoices({
      ...q,
      limit: clampLimit(q.limit)
    });
    return {
      items: page.items.map((r) => InvoiceDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetInvoiceHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute({ id }: { id: string }): Promise<InvoiceDto> {
    const inv = await this.repo.findInvoice(id);
    if (!inv) throw new NotFoundError("Invoice", id);
    return InvoiceDto.fromRow(inv);
  }
}

@Injectable()
export class ListInvoicePaymentsHandler {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}
  async execute({ invoiceId }: { invoiceId: string }): Promise<PaymentDto[]> {
    const rows = await this.repo.listPayments(invoiceId);
    return rows.map((r) => PaymentDto.fromRow(r));
  }
}
