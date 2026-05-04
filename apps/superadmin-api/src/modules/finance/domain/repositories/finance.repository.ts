import type { Page, PageQuery } from "@sportspulse/kernel";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "void";

export type PaymentMethod =
  | "cash"
  | "check"
  | "credit_card"
  | "etransfer"
  | "bank_transfer"
  | "manual"
  | "refund";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface FeeScheduleRow {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  kind: string;
  code: string | null;
  currency: string;
  baseAmountCents: number;
  dueOffsetDays: number;
  lateFeeCents: number;
  seasonId: string | null;
  leagueId: string | null;
  divisionId: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItemRow {
  id: string;
  invoiceId: string;
  kind: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  feeScheduleId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface InvoiceRow {
  id: string;
  orgId: string;
  invoiceNumber: string;
  registrationId: string | null;
  recipientPersonId: string | null;
  recipientEmail: string | null;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  status: InvoiceStatus;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemRow[];
}

export interface PaymentRow {
  id: string;
  orgId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  receivedAt: Date;
  externalProviderId: string | null;
  recordedByUserId: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ----- Inputs -----

export interface ListFeeSchedulesQuery extends PageQuery {
  orgId?: string;
  kind?: string;
  isActive?: boolean;
}

export interface UpsertFeeScheduleInput {
  orgId: string;
  name: string;
  description?: string | null;
  kind?: string;
  code?: string | null;
  currency?: string;
  baseAmountCents: number;
  dueOffsetDays?: number;
  lateFeeCents?: number;
  seasonId?: string | null;
  leagueId?: string | null;
  divisionId?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ListInvoicesQuery extends PageQuery {
  orgId?: string;
  status?: InvoiceStatus;
  recipientPersonId?: string;
  registrationId?: string;
}

export interface CreateInvoiceInput {
  orgId: string;
  invoiceNumber?: string;
  registrationId?: string | null;
  recipientPersonId?: string | null;
  recipientEmail?: string | null;
  currency?: string;
  taxCents?: number;
  discountCents?: number;
  dueAt?: Date | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  items: Array<{
    kind?: string;
    description: string;
    quantity?: number;
    unitAmountCents: number;
    feeScheduleId?: string | null;
    metadata?: Record<string, unknown>;
  }>;
}

export interface RecordPaymentInput {
  orgId: string;
  invoiceId: string;
  amountCents: number;
  currency?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  receivedAt?: Date;
  externalProviderId?: string | null;
  recordedByUserId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

// ----- Repository -----

export interface FinanceRepository {
  // Fee schedules
  listFeeSchedules(q: ListFeeSchedulesQuery): Promise<Page<FeeScheduleRow>>;
  findFeeSchedule(id: string): Promise<FeeScheduleRow | null>;
  upsertFeeSchedule(
    input: UpsertFeeScheduleInput & { id?: string }
  ): Promise<FeeScheduleRow>;

  // Invoices
  listInvoices(q: ListInvoicesQuery): Promise<Page<InvoiceRow>>;
  findInvoice(id: string): Promise<InvoiceRow | null>;
  findInvoiceByIdempotencyKey(key: string): Promise<InvoiceRow | null>;
  createInvoice(input: CreateInvoiceInput): Promise<InvoiceRow>;
  /** Mark an invoice as sent (issued_at = now). */
  markSent(id: string): Promise<InvoiceRow>;
  voidInvoice(id: string, reason?: string): Promise<InvoiceRow>;
  /** Re-derive paid_cents and status from current payments. Idempotent. */
  reconcileStatus(id: string): Promise<InvoiceRow>;

  // Payments
  recordPayment(input: RecordPaymentInput): Promise<PaymentRow>;
  listPayments(invoiceId: string): Promise<PaymentRow[]>;

  /** Sequence the next invoice number for an org (e.g. "INV-2026-001"). */
  nextInvoiceNumber(orgId: string): Promise<string>;
}

export const FINANCE_REPOSITORY = Symbol("FINANCE_REPOSITORY");
