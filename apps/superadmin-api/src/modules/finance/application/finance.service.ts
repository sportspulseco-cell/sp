import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  FINANCE_REPOSITORY,
  type CreateInvoiceInput,
  type FeeScheduleRow,
  type FinanceRepository,
  type InvoiceRow,
  type RecordPaymentInput
} from "../domain/repositories/finance.repository";

/**
 * Finance facade. Used by other modules' command handlers (e.g.
 * `ReviewRegistrationHandler` on approve) — never throws so a queued
 * invoice never blocks the upstream domain mutation.
 */
@Injectable()
export class FinanceService {
  private readonly log = new Logger(FinanceService.name);

  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repo: FinanceRepository
  ) {}

  /**
   * Idempotent: spawn an invoice from a fee schedule for a registration.
   * Re-calling with the same registrationId returns the existing row.
   */
  async invoiceForRegistration(args: {
    orgId: string;
    registrationId: string;
    recipientPersonId: string | null;
    feeSchedule?: FeeScheduleRow | null;
    /** When no schedule is provided, fall back to a $0 line item. */
    fallbackDescription?: string;
  }): Promise<InvoiceRow | null> {
    try {
      const idempotencyKey = `registration:${args.registrationId}`;
      const existing = await this.repo.findInvoiceByIdempotencyKey(
        idempotencyKey
      );
      if (existing) return existing;

      const sched = args.feeSchedule ?? null;
      const dueAt = sched?.dueOffsetDays
        ? new Date(Date.now() + sched.dueOffsetDays * 86_400_000)
        : null;

      const input: CreateInvoiceInput = {
        orgId: args.orgId,
        registrationId: args.registrationId,
        recipientPersonId: args.recipientPersonId,
        currency: sched?.currency ?? "USD",
        dueAt,
        idempotencyKey,
        items: [
          {
            kind: "registration_fee",
            description:
              sched?.name ?? args.fallbackDescription ?? "Registration fee",
            unitAmountCents: sched?.baseAmountCents ?? 0,
            quantity: 1,
            feeScheduleId: sched?.id ?? null
          }
        ]
      };
      const invoice = await this.repo.createInvoice(input);
      // System-issued invoices are sent immediately.
      return await this.repo.markSent(invoice.id);
    } catch (err) {
      this.log.error(
        `invoice creation failed: ${(err as Error).message}`,
        (err as Error).stack
      );
      return null;
    }
  }

  recordPayment(input: RecordPaymentInput) {
    return this.repo.recordPayment(input);
  }

  reconcile(invoiceId: string) {
    return this.repo.reconcileStatus(invoiceId);
  }
}
